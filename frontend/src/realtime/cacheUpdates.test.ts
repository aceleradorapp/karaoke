import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobDTO, SongDTO } from '@caraoke/shared';
import { jobsQueryKey } from '../api/jobs';
import type { SystemInfo } from '../api/system';
import {
  applyJobUpdate,
  applyJobsReordered,
  applySongDeleted,
  applySongUpdate,
  applyWorkerStatus,
} from './cacheUpdates';

function buildJob(overrides: Partial<JobDTO> = {}): JobDTO {
  return {
    id: 'job1',
    songId: 'song1',
    kind: 'PROCESS',
    status: 'PENDING',
    step: null,
    progress: 0,
    message: null,
    position: 1,
    device: null,
    workerId: null,
    workerName: null,
    targetWorkerId: null,
    targetWorkerName: null,
    error: null,
    attempts: 0,
    createdAt: '2026-10-01T10:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    song: { title: 'Song', artist: 'Artist', coverUrl: null, durationSec: null },
    ...overrides,
  };
}

describe('job cache updates', () => {
  let queryClient: QueryClient;
  const active = () => queryClient.getQueryData<JobDTO[]>(jobsQueryKey('active'));
  const recent = () => queryClient.getQueryData<JobDTO[]>(jobsQueryKey('recent'));

  beforeEach(() => {
    queryClient = new QueryClient();
    queryClient.setQueryData(jobsQueryKey('active'), []);
    queryClient.setQueryData(jobsQueryKey('recent'), []);
  });

  it('adds a new active job and keeps the active list ordered by position', () => {
    applyJobUpdate(queryClient, buildJob({ id: 'b', position: 2 }));
    applyJobUpdate(queryClient, buildJob({ id: 'a', position: 1 }));

    expect(active()?.map((job) => job.id)).toEqual(['a', 'b']);
  });

  it('replaces a job that is already in the list with its newer state', () => {
    applyJobUpdate(queryClient, buildJob({ status: 'RUNNING', progress: 10 }));
    applyJobUpdate(queryClient, buildJob({ status: 'RUNNING', progress: 55 }));

    expect(active()).toHaveLength(1);
    expect(active()?.[0]?.progress).toBe(55);
  });

  it('moves a finished job from the active list to the recent list', () => {
    applyJobUpdate(queryClient, buildJob({ status: 'RUNNING' }));
    applyJobUpdate(queryClient, buildJob({ status: 'DONE', finishedAt: '2026-10-01T11:00:00.000Z' }));

    expect(active()).toEqual([]);
    expect(recent()?.map((job) => job.status)).toEqual(['DONE']);
  });

  it('keeps the recent list with the newest finish first', () => {
    applyJobUpdate(
      queryClient,
      buildJob({ id: 'old', status: 'FAILED', finishedAt: '2026-10-01T09:00:00.000Z' }),
    );
    applyJobUpdate(
      queryClient,
      buildJob({ id: 'new', status: 'DONE', finishedAt: '2026-10-01T12:00:00.000Z' }),
    );

    expect(recent()?.map((job) => job.id)).toEqual(['new', 'old']);
  });

  it('takes a retried job out of the recent list', () => {
    applyJobUpdate(queryClient, buildJob({ status: 'FAILED', finishedAt: '2026-10-01T09:00:00.000Z' }));
    applyJobUpdate(queryClient, buildJob({ status: 'PENDING', finishedAt: null }));

    expect(recent()).toEqual([]);
    expect(active()).toHaveLength(1);
  });

  it('does not create caches for lists nobody asked for', () => {
    const fresh = new QueryClient();
    applyJobUpdate(fresh, buildJob());
    expect(fresh.getQueryData(jobsQueryKey('active'))).toBeUndefined();
    expect(fresh.getQueryData(jobsQueryKey('recent'))).toBeUndefined();
  });

  it('applies a new order, keeping the running job first and renumbering the positions', () => {
    for (const [id, status] of [
      ['running', 'RUNNING'],
      ['a', 'PENDING'],
      ['b', 'PENDING'],
      ['c', 'PENDING'],
    ] as const) {
      applyJobUpdate(queryClient, buildJob({ id, status, position: active()!.length + 1 }));
    }

    applyJobsReordered(queryClient, ['c', 'a', 'b']);

    expect(active()?.map((job) => [job.id, job.position])).toEqual([
      ['running', 1],
      ['c', 2],
      ['a', 3],
      ['b', 4],
    ]);
  });
});

describe('song and worker cache updates', () => {
  it('stores the updated song and refreshes the lists that show songs', () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const song = { id: 'song1', title: 'Evidências' } as SongDTO;

    applySongUpdate(queryClient, song);

    expect(queryClient.getQueryData(['song', 'song1'])).toBe(song);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['songs'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['home'] });
  });

  it('forgets a deleted song and refreshes the lists', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['song', 'song1'], { id: 'song1' });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    applySongDeleted(queryClient, 'song1');

    expect(queryClient.getQueryData(['song', 'song1'])).toBeUndefined();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['songs'] });
  });

  it('patches the worker status without losing the other system information', () => {
    const queryClient = new QueryClient();
    const system: SystemInfo = {
      worker: {
        online: false,
        device: null,
        gpuName: null,
        lastSeen: null,
        cudaAvailable: true,
        vramMb: 2047,
        ytdlpVersion: '2026.1',
      },
      storage: { usedBytes: 10, songs: 3 },
    };
    queryClient.setQueryData(['system'], system);

    applyWorkerStatus(queryClient, { online: true, device: 'cpu', gpuName: 'GT 1030' });

    expect(queryClient.getQueryData<SystemInfo>(['system'])).toEqual({
      worker: { ...system.worker, online: true, device: 'cpu', gpuName: 'GT 1030' },
      storage: { usedBytes: 10, songs: 3 },
    });
  });

  it('ignores a worker status when the system information was never loaded', () => {
    const queryClient = new QueryClient();
    applyWorkerStatus(queryClient, { online: true, device: 'cpu', gpuName: null });
    expect(queryClient.getQueryData(['system'])).toBeUndefined();
  });
});
