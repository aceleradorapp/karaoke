import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { LOCAL_WORKER_ID } from '../../services/workerStatus.js';

export const MAX_JOB_ATTEMPTS = 3;
const GAVE_UP_MESSAGE = 'Interrompida várias vezes; tente de novo';

export interface RecoveryResult {
  requeued: number;
  gaveUp: number;
}

function runningOn(workerId: string | undefined): Prisma.JobWhereInput {
  if (workerId === undefined) return { status: 'RUNNING' };
  if (workerId === LOCAL_WORKER_ID) return { status: 'RUNNING', OR: [{ workerId }, { workerId: null }] };
  return { status: 'RUNNING', workerId };
}

export async function recoverInterruptedJobs(workerId?: string): Promise<RecoveryResult> {
  const interrupted = await prisma.job.findMany({
    where: runningOn(workerId),
    select: { id: true, songId: true, attempts: true },
  });

  const toRequeue = interrupted.filter((job) => job.attempts < MAX_JOB_ATTEMPTS);
  const toGiveUp = interrupted.filter((job) => job.attempts >= MAX_JOB_ATTEMPTS);

  await prisma.$transaction([
    prisma.job.updateMany({
      where: { id: { in: toRequeue.map((job) => job.id) } },
      data: { status: 'PENDING', step: null, progress: 0, message: null, device: null, workerId: null, startedAt: null },
    }),
    prisma.song.updateMany({
      where: { id: { in: toRequeue.map((job) => job.songId) } },
      data: { status: 'QUEUED' },
    }),
    prisma.job.updateMany({
      where: { id: { in: toGiveUp.map((job) => job.id) } },
      data: { status: 'FAILED', error: GAVE_UP_MESSAGE, finishedAt: new Date() },
    }),
    prisma.song.updateMany({
      where: { id: { in: toGiveUp.map((job) => job.songId) } },
      data: { status: 'ERROR' },
    }),
  ]);

  return { requeued: toRequeue.length, gaveUp: toGiveUp.length };
}
