import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Multipart } from '@fastify/multipart';
import { prisma } from '../../db.js';
import { songDir } from '../../services/storage.js';
import { LOCAL_WORKER_ID } from '../../services/workerStatus.js';
import { AppError, conflict, notFound } from '../../utils/errors.js';
import { publishJob } from './publish.js';

export const RESULT_FILES = new Set([
  'instrumental.mp3',
  'voz.mp3',
  'letra.json',
  'letra.original.json',
  'letra.lrc',
  'capa.jpg',
  'melodia.json',
]);

const BAD_REQUEST = 400;

function notYourJob() {
  return conflict('JOB_NOT_YOURS', 'Esta música não está sendo processada por esta máquina');
}

export async function sourceFileOf(jobId: string, workerId: string): Promise<string> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw notFound('JOB_NOT_FOUND', 'Job não encontrado');
  if (job.status !== 'RUNNING' || job.workerId !== workerId) throw notYourJob();
  if (!job.sourcePath || !fs.existsSync(job.sourcePath)) {
    throw notFound('SOURCE_NOT_FOUND', 'O arquivo original não está mais no PC do karaokê');
  }
  return job.sourcePath;
}

export async function saveResultFiles(
  songId: string,
  workerId: string,
  parts: AsyncIterableIterator<Multipart>,
): Promise<string[]> {
  const running = await prisma.job.findFirst({ where: { songId, status: 'RUNNING', workerId } });
  if (!running) throw notYourJob();

  const directory = songDir(songId);
  await fsp.mkdir(directory, { recursive: true });
  const saved: string[] = [];
  for await (const part of parts) {
    if (part.type !== 'file') continue;
    if (!RESULT_FILES.has(part.filename)) {
      part.file.resume();
      throw new AppError('UNEXPECTED_FILE', `Arquivo não esperado: ${part.filename}`, BAD_REQUEST);
    }
    const target = path.join(directory, part.filename);
    const partial = `${target}.parte`;
    await pipeline(part.file, fs.createWriteStream(partial));
    if (part.file.truncated) {
      await fsp.rm(partial, { force: true });
      throw new AppError('FILE_TOO_LARGE', `Arquivo grande demais: ${part.filename}`, BAD_REQUEST);
    }
    await fsp.rename(partial, target);
    saved.push(part.filename);
  }
  return saved;
}

export async function assertWorkerExists(workerId: string): Promise<void> {
  if (workerId === LOCAL_WORKER_ID) return;
  const worker = await prisma.worker.findUnique({ where: { id: workerId } });
  if (!worker || worker.revokedAt) throw notFound('WORKER_NOT_FOUND', 'Máquina não encontrada');
}

export async function setJobTarget(jobId: string, targetWorkerId: string | null): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw notFound('JOB_NOT_FOUND', 'Job não encontrado');
  if (job.status !== 'PENDING') {
    throw conflict('JOB_NOT_PENDING', 'Só dá para escolher a máquina de músicas que ainda aguardam na fila');
  }
  if (targetWorkerId) await assertWorkerExists(targetWorkerId);
  await prisma.job.update({ where: { id: jobId }, data: { targetWorkerId } });
  await publishJob(jobId);
}
