import type { ProcessingEstimate } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { getWorkerInfo } from '../../services/workerStatus.js';

export type DeviceKind = 'cpu' | 'gpu';

export interface FinishedSample {
  durationSec: number;
  processingSec: number;
}

export const DEFAULT_SECONDS_PER_SONG_SECOND: Record<DeviceKind, number> = { cpu: 1.2, gpu: 0.4 };
export const MIN_SAMPLES = 3;
export const UNKNOWN_DURATION_SEC = 240;
const SAMPLE_LIMIT = 15;

export function deviceKindOf(device: string | null | undefined): DeviceKind {
  return !device || device === 'cpu' ? 'cpu' : 'gpu';
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function buildEstimate(samples: FinishedSample[], kind: DeviceKind): ProcessingEstimate {
  const ratios = samples
    .filter((sample) => sample.durationSec > 0 && sample.processingSec > 0)
    .map((sample) => sample.processingSec / sample.durationSec);
  const hasHistory = ratios.length >= MIN_SAMPLES;
  return {
    secondsPerSongSecond: hasHistory
      ? Math.round(median(ratios) * 100) / 100
      : DEFAULT_SECONDS_PER_SONG_SECOND[kind],
    basedOnJobs: hasHistory ? ratios.length : 0,
    unknownDurationSec: UNKNOWN_DURATION_SEC,
  };
}

export async function getProcessingEstimate(): Promise<ProcessingEstimate> {
  const kind = deviceKindOf(getWorkerInfo().device);
  const jobs = await prisma.job.findMany({
    where: {
      status: 'DONE',
      startedAt: { not: null },
      finishedAt: { not: null },
      song: { durationSec: { gt: 0 } },
      ...(kind === 'cpu' ? { OR: [{ device: 'cpu' }, { device: null }] } : { device: { notIn: ['cpu'] } }),
    },
    orderBy: { finishedAt: 'desc' },
    take: SAMPLE_LIMIT,
    include: { song: { select: { durationSec: true } } },
  });
  const samples = jobs.map((job) => ({
    durationSec: job.song.durationSec ?? 0,
    processingSec: ((job.finishedAt?.getTime() ?? 0) - (job.startedAt?.getTime() ?? 0)) / 1000,
  }));
  return buildEstimate(samples, kind);
}
