import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJobFixture } from '../../../test/fixtures.js';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { recordHeartbeat, resetWorkerStatus } from '../../services/workerStatus.js';
import { buildEstimate, deviceKindOf, UNKNOWN_DURATION_SEC } from './estimate.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn() }));

describe('buildEstimate', () => {
  it('uses the median time per second of song of the finished jobs', () => {
    const estimate = buildEstimate(
      [
        { durationSec: 200, processingSec: 220 },
        { durationSec: 100, processingSec: 100 },
        { durationSec: 300, processingSec: 900 },
      ],
      'cpu',
    );
    expect(estimate).toEqual({ secondsPerSongSecond: 1.1, basedOnJobs: 3, unknownDurationSec: UNKNOWN_DURATION_SEC });
  });

  it('falls back to the default of the device with too little history', () => {
    const few = [{ durationSec: 200, processingSec: 600 }];
    expect(buildEstimate(few, 'cpu')).toMatchObject({ secondsPerSongSecond: 1.2, basedOnJobs: 0 });
    expect(buildEstimate([], 'gpu')).toMatchObject({ secondsPerSongSecond: 0.4, basedOnJobs: 0 });
  });

  it('ignores samples without duration or time', () => {
    const samples = [
      { durationSec: 0, processingSec: 100 },
      { durationSec: 100, processingSec: 0 },
      { durationSec: 100, processingSec: 200 },
    ];
    expect(buildEstimate(samples, 'cpu').basedOnJobs).toBe(0);
  });

  it('tells the CPU apart from any graphics card', () => {
    expect(deviceKindOf('cpu')).toBe('cpu');
    expect(deviceKindOf(null)).toBe('cpu');
    expect(deviceKindOf('cuda')).toBe('gpu');
  });
});

describe('GET /api/jobs/estimate', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await resetDatabase();
    resetWorkerStatus();
  });

  afterAll(async () => {
    resetWorkerStatus();
    await app.close();
    await prisma.$disconnect();
  });

  async function finishedJob(durationSec: number, processingSec: number, device: string) {
    const { job, song } = await createJobFixture({ status: 'DONE', finishedAt: new Date() });
    await prisma.song.update({ where: { id: song.id }, data: { durationSec } });
    const finishedAt = new Date();
    await prisma.job.update({
      where: { id: job.id },
      data: { device, finishedAt, startedAt: new Date(finishedAt.getTime() - processingSec * 1000) },
    });
  }

  it('measures from the jobs processed on the same kind of device as the worker', async () => {
    await finishedJob(200, 200, 'cpu');
    await finishedJob(100, 120, 'cpu');
    await finishedJob(300, 330, 'cpu');
    await finishedJob(200, 60, 'cuda');

    const response = await app.inject({ method: 'GET', url: '/api/jobs/estimate' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ secondsPerSongSecond: 1.1, basedOnJobs: 3, unknownDurationSec: 240 });
  });

  it('uses the default of the graphics card when the worker switches to it', async () => {
    await finishedJob(200, 200, 'cpu');
    await finishedJob(100, 120, 'cpu');
    await finishedJob(300, 330, 'cpu');
    recordHeartbeat({
      instanceId: 'w1',
      device: 'cuda',
      cudaAvailable: true,
      gpuName: 'RTX',
      vramMb: 8000,
      ytdlpVersion: null,
    });

    const response = await app.inject({ method: 'GET', url: '/api/jobs/estimate' });

    expect(response.json()).toMatchObject({ secondsPerSongSecond: 0.4, basedOnJobs: 0 });
  });

  it('sends the song duration along with each job', async () => {
    const { song } = await createJobFixture();
    await prisma.song.update({ where: { id: song.id }, data: { durationSec: 215 } });

    const items = (await app.inject({ method: 'GET', url: '/api/jobs' })).json().items;

    expect(items[0].song.durationSec).toBe(215);
  });
});
