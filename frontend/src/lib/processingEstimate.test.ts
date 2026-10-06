import type { ProcessingEstimate } from '@caraoke/shared';
import { describe, expect, it } from 'vitest';
import { buildJob } from '../test/builders';
import { describeEta, estimateQueue, formatEta } from './processingEstimate';

const ESTIMATE: ProcessingEstimate = { secondsPerSongSecond: 1, basedOnJobs: 5, unknownDurationSec: 240 };
const NOW = Date.parse('2026-10-06T12:00:00.000Z');

function job(id: string, status: 'RUNNING' | 'PENDING', position: number, durationSec: number | null, startedSecondsAgo = 0) {
  const base = buildJob({ status, position });
  return {
    ...base,
    id,
    startedAt: status === 'RUNNING' ? new Date(NOW - startedSecondsAgo * 1000).toISOString() : null,
    song: { ...base.song, durationSec },
  };
}

describe('estimateQueue', () => {
  it('subtracts the time already spent on the song being processed', () => {
    const eta = estimateQueue([job('a', 'RUNNING', 1, 300, 120)], ESTIMATE, NOW);
    expect(eta.byJob.get('a')).toEqual({ startsInSec: 0, readyInSec: 180 });
  });

  it('never says less than 30 seconds for a song still running', () => {
    const eta = estimateQueue([job('a', 'RUNNING', 1, 100, 500)], ESTIMATE, NOW);
    expect(eta.byJob.get('a')?.readyInSec).toBe(30);
  });

  it('adds up the songs ahead in the queue order', () => {
    const jobs = [
      job('c', 'PENDING', 3, null),
      job('a', 'RUNNING', 1, 300, 100),
      job('b', 'PENDING', 2, 120),
    ];
    const eta = estimateQueue(jobs, { ...ESTIMATE, secondsPerSongSecond: 2 }, NOW);

    expect(eta.byJob.get('a')).toEqual({ startsInSec: 0, readyInSec: 500 });
    expect(eta.byJob.get('b')).toEqual({ startsInSec: 500, readyInSec: 740 });
    expect(eta.byJob.get('c')).toEqual({ startsInSec: 740, readyInSec: 1220 });
    expect(eta.allReadyInSec).toBe(1220);
  });

  it('is empty without jobs', () => {
    const eta = estimateQueue([], ESTIMATE, NOW);
    expect(eta.allReadyInSec).toBe(0);
    expect(eta.byJob.size).toBe(0);
  });
});

describe('formatEta', () => {
  it('rounds to minutes and hours', () => {
    expect(formatEta(20)).toBe('menos de 1 min');
    expect(formatEta(100)).toBe('~2 min');
    expect(formatEta(3600)).toBe('~1 h');
    expect(formatEta(4980)).toBe('~1 h 23 min');
  });

  it('describes the running song and the waiting ones', () => {
    expect(describeEta({ startsInSec: 0, readyInSec: 180 })).toBe('Faltam ~3 min');
    expect(describeEta({ startsInSec: 240, readyInSec: 600 })).toBe('Começa em ~4 min · pronta em ~10 min');
  });
});
