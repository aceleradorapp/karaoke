import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { TEST_WORKER_TOKEN } from '../../../test/constants.js';
import { resetWorkerStatus } from '../../services/workerStatus.js';

const AUTH_HEADERS = { 'x-worker-token': TEST_WORKER_TOKEN };

const HEARTBEAT = {
  device: 'cpu',
  cudaAvailable: true,
  gpuName: 'GeForce GT 1030',
  vramMb: 2048,
  ytdlpVersion: '2025.01.01',
};

describe('worker internal routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await resetDatabase();
    resetWorkerStatus();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('starts with the worker offline', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/system/info' });
    expect(response.json().worker.online).toBe(false);
  });

  it('marks the worker online after a heartbeat', async () => {
    const heartbeat = await app.inject({
      method: 'POST',
      url: '/api/internal/worker/heartbeat',
      headers: AUTH_HEADERS,
      payload: HEARTBEAT,
    });
    expect(heartbeat.statusCode).toBe(200);

    const info = await app.inject({ method: 'GET', url: '/api/system/info' });
    expect(info.json().worker).toMatchObject({ online: true, device: 'cpu', gpuName: 'GeForce GT 1030' });
  });

  it('rejects an invalid heartbeat body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/worker/heartbeat',
      headers: AUTH_HEADERS,
      payload: { device: 'cpu' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('serves the app settings merged with the defaults', async () => {
    await prisma.setting.create({ data: { key: 'processing.device', value: 'gpu' } });
    await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });

    const response = await app.inject({
      method: 'GET',
      url: '/api/internal/settings',
      headers: AUTH_HEADERS,
    });

    const settings = response.json();
    expect(settings['processing.device']).toBe('gpu');
    expect(settings['processing.demucsModel']).toBe('htdemucs');
    expect(settings).not.toHaveProperty('access.code');
  });

  it('answers 204 when there is no job to claim', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/jobs/claim',
      headers: AUTH_HEADERS,
    });
    expect(response.statusCode).toBe(204);
  });

  it('hands out the next pending job', async () => {
    const song = await prisma.song.create({ data: { title: 'T', artist: 'A', source: 'UPLOAD' } });
    await prisma.job.create({ data: { songId: song.id, position: 1, sourcePath: 'C:\\in\\t.mp3' } });

    const response = await app.inject({
      method: 'POST',
      url: '/api/internal/jobs/claim',
      headers: AUTH_HEADERS,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().job.song.id).toBe(song.id);
    expect(response.json().paths.songDir).toContain(song.id);
  });
});
