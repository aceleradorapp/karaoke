import type { JobDTO, ProcessingEstimate } from './types.js';

export interface JobEta {
  startsInSec: number;
  readyInSec: number;
}

export interface QueueEta {
  byJob: Map<string, JobEta>;
  allReadyInSec: number;
}

export const MIN_REMAINING_SEC = 30;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

export function expectedSeconds(job: JobDTO, estimate: ProcessingEstimate): number {
  const duration = job.song.durationSec && job.song.durationSec > 0 ? job.song.durationSec : estimate.unknownDurationSec;
  return duration * estimate.secondsPerSongSecond;
}

export function estimateQueue(jobs: JobDTO[], estimate: ProcessingEstimate, now: number): QueueEta {
  const byJob = new Map<string, JobEta>();
  let busyUntil = 0;

  for (const job of jobs.filter((item) => item.status === 'RUNNING')) {
    const elapsed = job.startedAt ? Math.max(0, (now - Date.parse(job.startedAt)) / MS_PER_SECOND) : 0;
    const remaining = Math.max(MIN_REMAINING_SEC, expectedSeconds(job, estimate) - elapsed);
    byJob.set(job.id, { startsInSec: 0, readyInSec: remaining });
    busyUntil = Math.max(busyUntil, remaining);
  }

  const pending = jobs.filter((item) => item.status === 'PENDING').sort((a, b) => a.position - b.position);
  for (const job of pending) {
    const readyInSec = busyUntil + expectedSeconds(job, estimate);
    byJob.set(job.id, { startsInSec: busyUntil, readyInSec });
    busyUntil = readyInSec;
  }

  return { byJob, allReadyInSec: busyUntil };
}

export function formatEta(seconds: number): string {
  const minutes = Math.round(seconds / SECONDS_PER_MINUTE);
  if (minutes < 1) return 'menos de 1 min';
  if (minutes < MINUTES_PER_HOUR) return `~${minutes} min`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  return rest === 0 ? `~${hours} h` : `~${hours} h ${rest} min`;
}

export function describeEta(eta: JobEta): string {
  if (eta.startsInSec === 0) return `Faltam ${formatEta(eta.readyInSec)}`;
  return `Começa em ${formatEta(eta.startsInSec)} · pronta em ${formatEta(eta.readyInSec)}`;
}
