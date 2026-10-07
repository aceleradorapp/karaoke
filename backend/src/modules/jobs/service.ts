import type { Job, Prisma } from '@prisma/client';
import type { JobStep, SongSource } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { songDir, storagePaths } from '../../services/storage.js';
import { LOCAL_WORKER_ID } from '../../services/workerStatus.js';
import { stepsForSource } from './steps.js';

const MAX_CLAIM_ATTEMPTS = 5;
export const RESYNC_KIND = 'RESYNC';

export interface ClaimedJob {
  job: {
    id: string;
    steps: JobStep[];
    sourcePath: string | null;
    song: {
      id: string;
      title: string;
      artist: string;
      source: SongSource;
      youtubeId: string | null;
    };
  };
  paths: {
    storageDir: string;
    songDir: string;
    tmpDir: string;
  };
}

async function tryClaimNextJob(workerId: string): Promise<ClaimedJob | null | 'retry'> {
  return prisma.$transaction(async (transaction) => {
    const candidate = await transaction.job.findFirst({
      where: { status: 'PENDING', OR: [{ targetWorkerId: null }, { targetWorkerId: workerId }] },
      orderBy: { position: 'asc' },
      include: { song: true },
    });
    if (!candidate) return null;

    const claimed = await transaction.job.updateMany({
      where: { id: candidate.id, status: 'PENDING' },
      data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 }, workerId },
    });
    if (claimed.count === 0) return 'retry';

    const isResync = candidate.kind === RESYNC_KIND;
    if (!isResync) {
      await transaction.song.update({ where: { id: candidate.songId }, data: { status: 'PROCESSING' } });
    }

    const { song } = candidate;
    return {
      job: {
        id: candidate.id,
        steps: isResync ? ['RESYNC'] : stepsForSource(song.source),
        sourcePath: candidate.sourcePath,
        song: {
          id: song.id,
          title: song.title,
          artist: song.artist,
          source: song.source,
          youtubeId: song.youtubeId,
        },
      },
      paths: {
        storageDir: storagePaths.root,
        songDir: songDir(song.id),
        tmpDir: storagePaths.tmpDir,
      },
    };
  });
}

export async function claimNextJob(workerId: string = LOCAL_WORKER_ID): Promise<ClaimedJob | null> {
  for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt++) {
    const result = await tryClaimNextJob(workerId);
    if (result !== 'retry') return result;
  }
  return null;
}

export async function nextQueuePosition(transaction: Prisma.TransactionClient): Promise<number> {
  const { _max } = await transaction.job.aggregate({
    where: { status: { in: ['PENDING', 'RUNNING'] } },
    _max: { position: true },
  });
  return (_max.position ?? 0) + 1;
}

export async function enqueueJob(
  transaction: Prisma.TransactionClient,
  songId: string,
  sourcePath: string | null,
  targetWorkerId: string | null = null,
): Promise<Job> {
  const position = await nextQueuePosition(transaction);
  return transaction.job.create({ data: { songId, position, sourcePath, targetWorkerId } });
}
