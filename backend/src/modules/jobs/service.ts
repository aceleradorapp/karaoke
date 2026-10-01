import type { JobStep, SongSource } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { songDir, storagePaths } from '../../services/storage.js';
import { stepsForSource } from './steps.js';

const MAX_CLAIM_ATTEMPTS = 5;

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

async function tryClaimNextJob(): Promise<ClaimedJob | null | 'retry'> {
  return prisma.$transaction(async (transaction) => {
    const candidate = await transaction.job.findFirst({
      where: { status: 'PENDING' },
      orderBy: { position: 'asc' },
      include: { song: true },
    });
    if (!candidate) return null;

    const claimed = await transaction.job.updateMany({
      where: { id: candidate.id, status: 'PENDING' },
      data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return 'retry';

    await transaction.song.update({ where: { id: candidate.songId }, data: { status: 'PROCESSING' } });

    const { song } = candidate;
    return {
      job: {
        id: candidate.id,
        steps: stepsForSource(song.source),
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

export async function claimNextJob(): Promise<ClaimedJob | null> {
  for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt++) {
    const result = await tryClaimNextJob();
    if (result !== 'retry') return result;
  }
  return null;
}
