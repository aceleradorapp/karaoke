import fs from 'node:fs/promises';
import type { Job, JobStatus, Prisma } from '@prisma/client';
import type { JobDTO } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { emitToAll } from '../../realtime.js';
import { moveToError } from '../../services/storage.js';
import { conflict, notFound } from '../../utils/errors.js';
import { toJobDTO } from '../songs/mapper.js';
import { enqueueJob } from './service.js';
import { publishJob } from './publish.js';

export type JobScope = 'active' | 'recent';

const ACTIVE_STATUSES: JobStatus[] = ['PENDING', 'RUNNING'];
const FINISHED_STATUSES: JobStatus[] = ['DONE', 'FAILED', 'CANCELED'];
const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;
const CANCELED_MESSAGE = 'Cancelado';

function jobNotFound() {
  return notFound('JOB_NOT_FOUND', 'Job não encontrado');
}

async function findJobOrThrow(id: string): Promise<Job> {
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) throw jobNotFound();
  return job;
}

export async function listJobs(scope: JobScope, now: number = Date.now()): Promise<JobDTO[]> {
  const isActive = scope === 'active';
  const jobs = await prisma.job.findMany({
    where: isActive
      ? { status: { in: ACTIVE_STATUSES } }
      : { status: { in: FINISHED_STATUSES }, finishedAt: { gte: new Date(now - RECENT_WINDOW_MS) } },
    orderBy: isActive ? { position: 'asc' } : { finishedAt: 'desc' },
    include: { song: true },
  });
  return jobs.map((job) => toJobDTO(job, job.song));
}

async function applyOrder(transaction: Prisma.TransactionClient, ids: string[]): Promise<string[]> {
  const pending = await transaction.job.findMany({
    where: { status: 'PENDING' },
    orderBy: { position: 'asc' },
    select: { id: true },
  });
  const pendingIds = pending.map((job) => job.id);
  const requested = [...new Set(ids)];

  const isEveryRequestedPending = requested.every((id) => pendingIds.includes(id));
  if (!isEveryRequestedPending) {
    throw conflict('JOB_NOT_PENDING', 'Só é possível reordenar músicas que ainda aguardam na fila');
  }

  const ordered = [...requested, ...pendingIds.filter((id) => !requested.includes(id))];
  const running = await transaction.job.aggregate({ where: { status: 'RUNNING' }, _max: { position: true } });
  const firstPosition = (running._max.position ?? 0) + 1;

  for (const [index, id] of ordered.entries()) {
    await transaction.job.update({ where: { id }, data: { position: firstPosition + index } });
  }
  return ordered;
}

export async function reorderJobs(ids: string[]): Promise<string[]> {
  const ordered = await prisma.$transaction((transaction) => applyOrder(transaction, ids));
  emitToAll('jobs:reordered', { ids: ordered });
  return ordered;
}

export async function cancelJob(id: string): Promise<void> {
  const job = await findJobOrThrow(id);
  if (!ACTIVE_STATUSES.includes(job.status)) {
    throw conflict('JOB_NOT_CANCELABLE', 'Esta música já terminou de ser processada');
  }

  const isWaiting = job.status === 'PENDING';
  const movedSource = isWaiting && job.sourcePath ? await moveToError(job.sourcePath) : null;

  await prisma.$transaction([
    prisma.job.update({
      where: { id },
      data: {
        status: 'CANCELED',
        message: CANCELED_MESSAGE,
        finishedAt: new Date(),
        ...(movedSource ? { sourcePath: movedSource } : {}),
      },
    }),
    prisma.song.update({ where: { id: job.songId }, data: { status: 'ERROR' } }),
  ]);
  await publishJob(id, { includeSong: true });
}

async function fileExists(path: string): Promise<boolean> {
  return fs.stat(path).then(
    () => true,
    () => false,
  );
}

export async function retryJob(id: string): Promise<JobDTO> {
  const job = await prisma.job.findUnique({ where: { id }, include: { song: true } });
  if (!job) throw jobNotFound();

  if (!['FAILED', 'CANCELED'].includes(job.status)) {
    throw conflict('JOB_NOT_RETRYABLE', 'Só é possível tentar de novo o que falhou ou foi cancelado');
  }

  const activeJob = await prisma.job.findFirst({
    where: { songId: job.songId, status: { in: ACTIVE_STATUSES } },
  });
  if (activeJob) throw conflict('JOB_ALREADY_ACTIVE', 'Esta música já está na fila');

  const isUpload = job.song.source === 'UPLOAD';
  const hasOriginal = Boolean(job.sourcePath) && (await fileExists(job.sourcePath as string));
  if (isUpload && !hasOriginal) {
    throw conflict('SOURCE_UNAVAILABLE', 'O arquivo original não está mais disponível. Envie de novo.');
  }

  const created = await prisma.$transaction(async (transaction) => {
    const next = await enqueueJob(transaction, job.songId, job.sourcePath);
    await transaction.song.update({ where: { id: job.songId }, data: { status: 'QUEUED' } });
    return next;
  });

  await publishJob(created.id, { includeSong: true });
  const song = await prisma.song.findUniqueOrThrow({ where: { id: job.songId } });
  return toJobDTO(created, song);
}

export async function deleteFinishedJob(id: string): Promise<void> {
  const job = await findJobOrThrow(id);
  if (!FINISHED_STATUSES.includes(job.status)) {
    throw conflict('JOB_STILL_ACTIVE', 'Cancele a música antes de removê-la da lista');
  }
  await prisma.job.delete({ where: { id } });
}
