import { describe, expect, it } from 'vitest';
import type { WorkerInfo } from '../../api/system';
import { deviceHint } from './deviceHint';

const BASE_WORKER: WorkerInfo = {
  online: true,
  device: 'cpu',
  gpuName: 'NVIDIA GeForce GT 1030',
  lastSeen: null,
  cudaAvailable: true,
  vramMb: 2047,
  ytdlpVersion: null,
};

describe('deviceHint', () => {
  it('explains that the worker is offline', () => {
    expect(deviceHint(undefined)).toContain('offline');
    expect(deviceHint({ ...BASE_WORKER, online: false })).toContain('offline');
  });

  it('says the CPU is used when there is no compatible GPU', () => {
    expect(deviceHint({ ...BASE_WORKER, cudaAvailable: false })).toContain('será usada a CPU');
  });

  it('explains that a GPU with little memory falls back to the CPU in automatic mode', () => {
    const hint = deviceHint(BASE_WORKER);
    expect(hint).toContain('NVIDIA GeForce GT 1030 (2 GB)');
    expect(hint).toContain('será usada a CPU, porque a GPU tem pouca memória');
  });

  it('says the GPU is used when it has enough memory', () => {
    const hint = deviceHint({ ...BASE_WORKER, gpuName: 'RTX 3060', vramMb: 12288 });
    expect(hint).toContain('RTX 3060 (12 GB)');
    expect(hint).toContain('será usada a GPU');
  });
});
