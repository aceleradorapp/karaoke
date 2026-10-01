import { prisma } from '../../db.js';

export const MAX_JOB_ATTEMPTS = 3;
const GAVE_UP_MESSAGE = 'Interrompida várias vezes; tente de novo';

export interface RecoveryResult {
  requeued: number;
  gaveUp: number;
}

export async function recoverInterruptedJobs(): Promise<RecoveryResult> {
  const interrupted = await prisma.job.findMany({
    where: { status: 'RUNNING' },
    select: { id: true, songId: true, attempts: true },
  });

  const toRequeue = interrupted.filter((job) => job.attempts < MAX_JOB_ATTEMPTS);
  const toGiveUp = interrupted.filter((job) => job.attempts >= MAX_JOB_ATTEMPTS);

  await prisma.$transaction([
    prisma.job.updateMany({
      where: { id: { in: toRequeue.map((job) => job.id) } },
      data: { status: 'PENDING', step: null, progress: 0, message: null, device: null, startedAt: null },
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
