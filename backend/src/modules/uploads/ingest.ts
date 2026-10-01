import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import { z } from 'zod';
import { isSupportedAudioFile, parseYoutubeTitle } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { emitToAll } from '../../realtime.js';
import { enqueueJob } from '../jobs/service.js';
import { toJobDTO, toSongDTO } from '../songs/mapper.js';

const UNKNOWN_ARTIST = 'Desconhecido';
const MAX_TEXT_LENGTH = 200;
const STORED_NAME_PREFIX = /^\d{10,}(?:-\d+)?-/;
const META_SUFFIX = '.meta.json';

const uploadMetaSchema = z.object({
  originalName: z.string().optional(),
  profileId: z.string().optional(),
  title: z.string().optional(),
  artist: z.string().optional(),
});

export type UploadMeta = z.infer<typeof uploadMetaSchema>;

interface AudioTags {
  artist?: string;
  title?: string;
  durationSec: number | null;
}

export function metaPathFor(filePath: string): string {
  return `${filePath}${META_SUFFIX}`;
}

async function consumeMeta(filePath: string): Promise<UploadMeta> {
  const metaPath = metaPathFor(filePath);
  try {
    const parsed = uploadMetaSchema.safeParse(JSON.parse(await fs.readFile(metaPath, 'utf-8')));
    await fs.rm(metaPath, { force: true });
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

async function readTags(filePath: string): Promise<AudioTags> {
  try {
    const { common, format } = await parseFile(filePath);
    return {
      artist: common.artist?.trim() || undefined,
      title: common.title?.trim() || undefined,
      durationSec: format.duration ? Math.round(format.duration) : null,
    };
  } catch {
    return { durationSec: null };
  }
}

function displayNameOf(filePath: string, meta: UploadMeta): string {
  const fileName = meta.originalName ?? path.basename(filePath).replace(STORED_NAME_PREFIX, '');
  return path.parse(fileName).name;
}

function resolveArtistAndTitle(displayName: string, meta: UploadMeta, tags: AudioTags) {
  if (tags.artist && tags.title) return { artist: tags.artist, title: tags.title };
  if (meta.artist && meta.title) return { artist: meta.artist, title: meta.title };

  const parsed = parseYoutubeTitle(displayName);
  return { artist: parsed.artist || UNKNOWN_ARTIST, title: parsed.title };
}

async function existingProfileId(profileId: string | undefined): Promise<string | null> {
  if (!profileId) return null;
  const profile = await prisma.profile.findUnique({ where: { id: profileId }, select: { id: true } });
  return profile?.id ?? null;
}

async function isAlreadyQueued(filePath: string): Promise<boolean> {
  const job = await prisma.job.findFirst({
    where: { sourcePath: filePath, status: { in: ['PENDING', 'RUNNING'] } },
    select: { id: true },
  });
  return job !== null;
}

export async function ingestUploadedFile(filePath: string): Promise<boolean> {
  const absolutePath = path.resolve(filePath);
  if (!isSupportedAudioFile(absolutePath)) return false;
  if (await isAlreadyQueued(absolutePath)) return false;

  const meta = await consumeMeta(absolutePath);
  const tags = await readTags(absolutePath);
  const displayName = displayNameOf(absolutePath, meta);
  const { artist, title } = resolveArtistAndTitle(displayName, meta, tags);
  const addedById = await existingProfileId(meta.profileId);

  const { song, job } = await prisma.$transaction(async (transaction) => {
    const created = await transaction.song.create({
      data: {
        title: title.slice(0, MAX_TEXT_LENGTH),
        artist: artist.slice(0, MAX_TEXT_LENGTH),
        source: 'UPLOAD',
        originalFilename: (meta.originalName ?? path.basename(absolutePath)).slice(0, 255),
        durationSec: tags.durationSec,
        addedById,
      },
    });
    const queued = await enqueueJob(transaction, created.id, absolutePath);
    return { song: created, job: queued };
  });

  emitToAll('song:updated', toSongDTO(song, job));
  emitToAll('job:updated', toJobDTO(job, song));
  return true;
}
