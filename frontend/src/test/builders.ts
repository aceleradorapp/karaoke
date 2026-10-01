import type { JobDTO } from '@caraoke/shared';

let jobCounter = 0;

export function buildJob(overrides: Partial<JobDTO> = {}): JobDTO {
  jobCounter += 1;
  return {
    id: `job${jobCounter}`,
    songId: `song${jobCounter}`,
    status: 'PENDING',
    step: null,
    progress: 0,
    message: null,
    position: jobCounter,
    device: null,
    error: null,
    attempts: 0,
    createdAt: '2026-10-01T10:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    song: { title: `Música ${jobCounter}`, artist: 'Artista', coverUrl: null },
    ...overrides,
  };
}

export function buildWorkerInfo(overrides: Record<string, unknown> = {}) {
  return {
    online: true,
    lastSeen: null,
    device: 'cpu',
    gpuName: null,
    cudaAvailable: false,
    vramMb: null,
    ytdlpVersion: null,
    ...overrides,
  };
}
