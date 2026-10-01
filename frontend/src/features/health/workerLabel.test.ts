import { describe, expect, it } from 'vitest';
import type { WorkerInfo } from '../../api/system';
import { workerLabel } from './workerLabel';

const BASE_WORKER: WorkerInfo = {
  online: true,
  device: 'cpu',
  gpuName: null,
  lastSeen: null,
  cudaAvailable: false,
  vramMb: null,
  ytdlpVersion: null,
};

describe('workerLabel', () => {
  it('shows offline when there is no data or the worker is offline', () => {
    expect(workerLabel(undefined)).toBe('Worker offline');
    expect(workerLabel({ ...BASE_WORKER, online: false })).toBe('Worker offline');
  });

  it('names the device in use', () => {
    expect(workerLabel(BASE_WORKER)).toBe('Worker online · CPU');
    expect(workerLabel({ ...BASE_WORKER, device: 'cuda' })).toBe('Worker online · GPU');
  });
});
