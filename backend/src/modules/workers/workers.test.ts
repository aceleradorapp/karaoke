import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_WORKER_TOKEN } from '../../../test/constants.js';
import { createJobFixture } from '../../../test/fixtures.js';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { checkWorkers, resetWorkerStatus } from '../../services/workerStatus.js';
import { recoverLostWorker, resetPairing, startPairing } from './service.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn(), disconnectRoom: vi.fn() }));

const STAGE = '127.0.0.1';
const OTHER_PC = '192.168.0.42';
const HEARTBEAT = {
  instanceId: 'remoto-1',
  device: 'cuda',
  cudaAvailable: true,
  gpuName: 'NVIDIA RTX 3060',
  vramMb: 12288,
  ytdlpVersion: '2026.08.19',
};

describe('processing machines', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await resetDatabase();
    resetPairing();
    resetWorkerStatus();
  });

  afterAll(async () => {
    resetWorkerStatus();
    await app.close();
    await prisma.$disconnect();
  });

  const stage = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, remoteAddress: STAGE, ...(payload ? { payload } : {}) });
  const asWorker = (token: string, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url, remoteAddress: OTHER_PC, headers: { 'x-worker-token': token }, ...(payload ? { payload } : {}) });

  async function pair(name = 'Notebook GPU') {
    const { code } = (await stage('POST', '/api/workers/pairing')).json();
    const response = await app.inject({
      method: 'POST',
      url: '/api/workers/pair',
      remoteAddress: OTHER_PC,
      payload: { code, name },
    });
    expect(response.statusCode).toBe(201);
    return response.json() as { workerId: string; token: string; name: string };
  }

  describe('pairing', () => {
    it('gives a six digit code valid for ten minutes, with the address and the download', async () => {
      const response = await stage('POST', '/api/workers/pairing');
      const body = response.json();

      expect(response.statusCode).toBe(201);
      expect(body.code).toMatch(/^\d{6}$/);
      expect(Date.parse(body.expiresAt) - Date.now()).toBeGreaterThan(9 * 60 * 1000);
      expect(body.downloadPath).toBe('/downloads/Processador-do-Karaoke.zip');
    });

    it('pairs a machine from the network, without the phone code, and keeps only the hash of its token', async () => {
      const { workerId, token, name } = await pair();

      expect(token).toMatch(/^cw_/);
      expect(name).toBe('Notebook GPU');
      const stored = await prisma.worker.findUniqueOrThrow({ where: { id: workerId } });
      expect(stored.tokenHash).not.toContain(token);
    });

    it('uses each code only once', async () => {
      const { code } = (await stage('POST', '/api/workers/pairing')).json();
      const first = await app.inject({ method: 'POST', url: '/api/workers/pair', remoteAddress: OTHER_PC, payload: { code, name: 'A' } });
      const second = await app.inject({ method: 'POST', url: '/api/workers/pair', remoteAddress: OTHER_PC, payload: { code, name: 'B' } });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(401);
      expect(second.json().error.code).toBe('PAIRING_EXPIRED');
    });

    it('throws the code away after five wrong tries', async () => {
      const { code } = (await stage('POST', '/api/workers/pairing')).json();
      const wrong = code === '000000' ? '111111' : '000000';
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await app.inject({ method: 'POST', url: '/api/workers/pair', payload: { code: wrong, name: 'X' } });
        expect(response.json().error.code).toBe('PAIRING_INVALID');
      }
      const late = await app.inject({ method: 'POST', url: '/api/workers/pair', payload: { code, name: 'X' } });
      expect(late.json().error.code).toBe('PAIRING_EXPIRED');
    });

    it('refuses an expired code', async () => {
      const { code } = startPairing(Date.now() - 11 * 60 * 1000);
      const response = await app.inject({ method: 'POST', url: '/api/workers/pair', payload: { code, name: 'X' } });
      expect(response.json().error.code).toBe('PAIRING_EXPIRED');
    });

    it('keeps the list of machines for the stage only', async () => {
      expect((await app.inject({ method: 'GET', url: '/api/workers', remoteAddress: OTHER_PC })).statusCode).toBe(401);
      expect((await app.inject({ method: 'POST', url: '/api/workers/pairing', remoteAddress: OTHER_PC })).statusCode).toBe(401);
    });
  });

  describe('a paired machine', () => {
    it('reaches the worker routes with its own token and shows up online with its graphics card', async () => {
      const { workerId, token } = await pair();

      expect((await asWorker(token, 'POST', '/api/internal/worker/heartbeat', HEARTBEAT)).statusCode).toBe(200);
      expect((await asWorker('cw_errado', 'GET', '/api/internal/settings')).statusCode).toBe(401);

      const items = (await stage('GET', '/api/workers')).json().items;
      expect(items).toEqual([
        expect.objectContaining({ id: 'local', name: 'Este PC', isLocal: true, online: false }),
        expect.objectContaining({ id: workerId, name: 'Notebook GPU', isLocal: false, online: true, gpuName: 'NVIDIA RTX 3060' }),
      ]);
    });

    it('takes jobs meant for anyone or for itself, never the ones meant for another machine', async () => {
      const { workerId, token } = await pair();
      const forLocal = await createJobFixture({ title: 'Só aqui', position: 1 });
      await prisma.job.update({ where: { id: forLocal.job.id }, data: { targetWorkerId: 'local' } });
      const anyone = await createJobFixture({ title: 'Qualquer', position: 2 });

      const claim = await asWorker(token, 'POST', '/api/internal/jobs/claim');

      expect(claim.json().job.song.title).toBe('Qualquer');
      const job = await prisma.job.findUniqueOrThrow({ where: { id: anyone.job.id } });
      expect(job.workerId).toBe(workerId);
      const listed = (await stage('GET', '/api/jobs')).json().items;
      expect(listed.find((item: { id: string }) => item.id === anyone.job.id)).toMatchObject({
        workerName: 'Notebook GPU',
      });
      expect(listed.find((item: { id: string }) => item.id === forLocal.job.id)).toMatchObject({
        targetWorkerId: 'local',
        targetWorkerName: 'Este PC',
      });
      expect((await asWorker(token, 'POST', '/api/internal/jobs/claim')).statusCode).toBe(204);
    });

    it('can be renamed', async () => {
      const { workerId } = await pair();
      expect((await stage('PATCH', `/api/workers/${workerId}`, { name: 'PC do quarto' })).statusCode).toBe(204);
      expect((await stage('GET', '/api/workers')).json().items[1].name).toBe('PC do quarto');
      expect((await stage('PATCH', '/api/workers/local', { name: 'X' })).statusCode).toBe(409);
    });

    it('loses access when removed, giving back its song and the ones waiting for it', async () => {
      const { workerId, token } = await pair();
      const running = await createJobFixture({ title: 'Rodando', position: 1 });
      await asWorker(token, 'POST', '/api/internal/jobs/claim');
      const waiting = await createJobFixture({ title: 'Esperando', position: 2 });
      await prisma.job.update({ where: { id: waiting.job.id }, data: { targetWorkerId: workerId } });

      expect((await stage('DELETE', `/api/workers/${workerId}`)).statusCode).toBe(204);

      expect((await asWorker(token, 'GET', '/api/internal/settings')).statusCode).toBe(401);
      expect(await prisma.job.findUniqueOrThrow({ where: { id: running.job.id } })).toMatchObject({
        status: 'PENDING',
        workerId: null,
      });
      expect((await prisma.job.findUniqueOrThrow({ where: { id: waiting.job.id } })).targetWorkerId).toBeNull();
      expect((await stage('GET', '/api/workers')).json().items).toHaveLength(1);
    });

    it('gives back its song when it disappears for two minutes', async () => {
      const { workerId, token } = await pair();
      const running = await createJobFixture({ title: 'Rodando' });
      await asWorker(token, 'POST', '/api/internal/worker/heartbeat', HEARTBEAT);
      await asWorker(token, 'POST', '/api/internal/jobs/claim');

      const lost: string[] = [];
      checkWorkers(Date.now() + 60_000, (id) => lost.push(id));
      expect(lost).toEqual([]);
      checkWorkers(Date.now() + 121_000, (id) => lost.push(id));
      expect(lost).toEqual([workerId]);

      await recoverLostWorker(workerId);
      expect((await prisma.job.findUniqueOrThrow({ where: { id: running.job.id } })).status).toBe('PENDING');
    });

    it('does not disturb the local worker when it restarts', async () => {
      const { token } = await pair();
      const remote = await createJobFixture({ title: 'Remota', position: 1 });
      await asWorker(token, 'POST', '/api/internal/jobs/claim');

      const localHeartbeat = { ...HEARTBEAT, device: 'cpu', instanceId: 'local-1' };
      await asWorker(TEST_WORKER_TOKEN, 'POST', '/api/internal/worker/heartbeat', localHeartbeat);
      await asWorker(TEST_WORKER_TOKEN, 'POST', '/api/internal/worker/heartbeat', { ...localHeartbeat, instanceId: 'local-2' });

      expect((await prisma.job.findUniqueOrThrow({ where: { id: remote.job.id } })).status).toBe('RUNNING');
    });
  });
});
