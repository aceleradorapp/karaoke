import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Multipart } from '@fastify/multipart';
import { MAX_UPLOAD_FILES, isSupportedAudioFile } from '@caraoke/shared';
import { safeFilename, storagePaths } from '../../services/storage.js';
import { AppError } from '../../utils/errors.js';
import { metaPathFor, type UploadMeta } from './ingest.js';

export type RejectionReason = 'UNSUPPORTED_TYPE' | 'FILE_TOO_LARGE';

export interface ReceivedFile {
  filename: string;
}

export interface RejectedFile extends ReceivedFile {
  reason: RejectionReason;
}

export interface UploadResult {
  received: ReceivedFile[];
  rejected: RejectedFile[];
}

interface StagedFile {
  originalName: string;
  partPath: string;
  finalPath: string;
}

interface UploadSession {
  staged: StagedFile[];
  rejected: RejectedFile[];
  profileId?: string;
}

const PART_SUFFIX = '.part';
const FILES_LIMIT_ERROR_CODE = 'FST_FILES_LIMIT';

function stagedPathsFor(originalName: string, index: number): Pick<StagedFile, 'partPath' | 'finalPath'> {
  const storedName = `${Date.now()}-${index}-${safeFilename(originalName)}`;
  const finalPath = path.join(storagePaths.uploadDir, storedName);
  return { finalPath, partPath: `${finalPath}${PART_SUFFIX}` };
}

async function stageParts(parts: AsyncIterableIterator<Multipart>, session: UploadSession): Promise<void> {
  for await (const part of parts) {
    if (part.type === 'field') {
      const isProfileId = part.fieldname === 'profileId' && typeof part.value === 'string' && part.value;
      if (isProfileId) session.profileId = part.value as string;
      continue;
    }

    const originalName = part.filename;
    if (!isSupportedAudioFile(originalName)) {
      part.file.resume();
      session.rejected.push({ filename: originalName, reason: 'UNSUPPORTED_TYPE' });
      continue;
    }

    const paths = stagedPathsFor(originalName, session.staged.length);
    session.staged.push({ originalName, ...paths });
    await pipeline(part.file, createWriteStream(paths.partPath));

    if (part.file.truncated) {
      await fs.rm(paths.partPath, { force: true });
      session.staged.pop();
      session.rejected.push({ filename: originalName, reason: 'FILE_TOO_LARGE' });
    }
  }
}

async function publishStagedFile(file: StagedFile, profileId: string | undefined): Promise<void> {
  const meta: UploadMeta = { originalName: file.originalName, ...(profileId ? { profileId } : {}) };
  await fs.writeFile(metaPathFor(file.finalPath), JSON.stringify(meta));
  await fs.rename(file.partPath, file.finalPath);
}

function translateParsingError(error: unknown): unknown {
  const code = (error as { code?: string } | null)?.code;
  if (code !== FILES_LIMIT_ERROR_CODE) return error;
  return new AppError('TOO_MANY_FILES', `Envie no máximo ${MAX_UPLOAD_FILES} arquivos de cada vez`, 400);
}

export async function receiveUploads(parts: AsyncIterableIterator<Multipart>): Promise<UploadResult> {
  const session: UploadSession = { staged: [], rejected: [] };

  try {
    await stageParts(parts, session);
    for (const file of session.staged) await publishStagedFile(file, session.profileId);
  } catch (error) {
    await Promise.all(session.staged.map((file) => fs.rm(file.partPath, { force: true })));
    throw translateParsingError(error);
  }

  return {
    received: session.staged.map((file) => ({ filename: file.originalName })),
    rejected: session.rejected,
  };
}
