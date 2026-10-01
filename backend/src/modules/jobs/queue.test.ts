import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJobFixture, fileExists, listDirectory, resetStorage } from '../../../test/fixtures.js';
import { resetDatabase } from '../../../test/database.js';
import { TEST_WORKER_TOKEN } from '../../../test/constants.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { emitToAll } from '../../realtime.js';
import { storagePaths } from '../../services/storage.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn() }));

const HOUR_MS = 60 * 60 * 1000;
const WORKER_HEADERS = { 'x-worker-token': TEST_WORKER_TOKEN };

describe('job queue routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await resetDatabase();
    await resetStorage();
    vi.mocked(emitToAll).mockClear();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const get = (url: string) => app.inject({ method: 'GET', url });
  const post = (url: string) => app.inject({ method: 'POST', url });
  const reorder = (ids: string[]) =>
    app.inject({ method: 'PATCH', url: '/api/jobs/reorder', payload: { ids } });
  const emittedEvents = () => vi.mocked(emitToAll).mock.calls.map(([event]) => event);

  describe('listing', () => {
    it('lists active jobs by queue position with a summary of the song', async () => {
      await createJobFixture({ title: 'Second', position: 2 });
      await createJobFixture({ title: 'Running', position: 1, status: 'RUNNING' });
      await createJobFixture({ title: 'Finished', status: 'DONE', finishedAt: new Date() });

      const items = (await get('/api/jobs')).json().items;

      expect(items.map((item: { song: { title: string } }) => item.song.title)).toEqual([
        'Running',
        'Second',
      ]);
      expect(items[0]).toMatchObject({
        status: 'RUNNING',
        position: 1,
        song: { artist: 'Artist', coverUrl: null },
      });
    });

    it('lists finished jobs of the last 48 hours, newest first', async () => {
      const now = Date.now();
      await createJobFixture({ title: 'Old', status: 'DONE', finishedAt: new Date(now - 49 * HOUR_MS) });
      await createJobFixture({ title: 'Earlier', status: 'FAILED', finishedAt: new Date(now - 5 * HOUR_MS) });
      await createJobFixture({ title: 'Latest', status: 'CANCELED', finishedAt: new Date(now - HOUR_MS) });
      await createJobFixture({ title: 'Waiting' });

      const items = (await get('/api/jobs?scope=recent')).json().items;

      expect(items.map((item: { song: { title: string } }) => item.song.title)).toEqual([
        'Latest',
        'Earlier',
      ]);
    });

    it('rejects an unknown scope', async () => {
      expect((await get('/api/jobs?scope=all')).statusCode).toBe(400);
    });
  });

  describe('reordering', () => {
    it('applies the requested order and keeps unlisted waiting jobs after it', async () => {
      const a = await createJobFixture({ title: 'A', position: 1 });
      const b = await createJobFixture({ title: 'B', position: 2 });
      const c = await createJobFixture({ title: 'C', position: 3 });

      const response = await reorder([c.job.id, a.job.id]);

      expect(response.json().ids).toEqual([c.job.id, a.job.id, b.job.id]);
      const titles = (await get('/api/jobs'))
        .json()
        .items.map((item: { song: { title: string } }) => item.song.title);
      expect(titles).toEqual(['C', 'A', 'B']);
    });

    it('places the waiting jobs after the one that is running', async () => {
      const running = await createJobFixture({ title: 'Running', position: 5, status: 'RUNNING' });
      const a = await createJobFixture({ title: 'A', position: 6 });
      const b = await createJobFixture({ title: 'B', position: 7 });

      await reorder([b.job.id, a.job.id]);

      const positions = await prisma.job.findMany({ orderBy: { position: 'asc' } });
      expect(positions.map((job) => job.id)).toEqual([running.job.id, b.job.id, a.job.id]);
    });

    it('rejects ids that are not waiting in the queue and changes nothing', async () => {
      const a = await createJobFixture({ position: 1 });
      const running = await createJobFixture({ position: 2, status: 'RUNNING' });
      const b = await createJobFixture({ position: 3 });

      for (const intruder of [running.job.id, 'unknown-id']) {
        const response = await reorder([b.job.id, intruder]);
        expect(response.statusCode).toBe(409);
        expect(response.json().error.code).toBe('JOB_NOT_PENDING');
      }

      const stored = await prisma.job.findUniqueOrThrow({ where: { id: a.job.id } });
      expect(stored.position).toBe(1);
    });

    it('ignores duplicated ids and notifies the clients', async () => {
      const a = await createJobFixture({ position: 1 });
      const b = await createJobFixture({ position: 2 });

      const response = await reorder([b.job.id, b.job.id]);

      expect(response.json().ids).toEqual([b.job.id, a.job.id]);
      expect(emittedEvents()).toContain('jobs:reordered');
    });
  });

  describe('cancel', () => {
    it('cancels a waiting job, marks the song as failed and moves the original to the error folder', async () => {
      const { song, job, sourcePath } = await createJobFixture({ withOriginFile: true });

      const response = await post(`/api/jobs/${job.id}/cancel`);

      expect(response.statusCode).toBe(204);
      const stored = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
      expect(stored).toMatchObject({ status: 'CANCELED', message: 'Cancelado' });
      expect(stored.finishedAt).not.toBeNull();
      expect((await prisma.song.findUniqueOrThrow({ where: { id: song.id } })).status).toBe('ERROR');
      expect(await fileExists(sourcePath as string)).toBe(false);
      expect(stored.sourcePath).toContain(path.join(storagePaths.errorDir, ''));
      expect(await fileExists(stored.sourcePath as string)).toBe(true);
      expect(emittedEvents()).toEqual(['job:updated', 'song:updated']);
    });

    it('cancels a running job without touching the original while the worker may still be reading it', async () => {
      const { job, sourcePath } = await createJobFixture({ status: 'RUNNING', withOriginFile: true });

      await post(`/api/jobs/${job.id}/cancel`);

      expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('CANCELED');
      expect(await fileExists(sourcePath as string)).toBe(true);

      const progress = await app.inject({
        method: 'PATCH',
        url: `/api/internal/jobs/${job.id}/progress`,
        headers: WORKER_HEADERS,
        payload: { step: 'SEPARATE', progress: 10, message: null },
      });
      expect(progress.json()).toEqual({ cancel: true });
    });

    it('refuses to cancel finished jobs and answers 404 for unknown ones', async () => {
      const { job } = await createJobFixture({ status: 'DONE' });

      const finished = await post(`/api/jobs/${job.id}/cancel`);
      const unknown = await post('/api/jobs/unknown/cancel');

      expect(finished.statusCode).toBe(409);
      expect(finished.json().error.code).toBe('JOB_NOT_CANCELABLE');
      expect(unknown.statusCode).toBe(404);
    });
  });

  describe('retry', () => {
    it('queues a new job at the end for a failed song and keeps the original path', async () => {
      await createJobFixture({ title: 'Waiting', position: 1 });
      const failed = await createJobFixture({
        status: 'FAILED',
        songStatus: 'ERROR',
        position: 9,
        withOriginFile: true,
        finishedAt: new Date(),
      });

      const response = await post(`/api/jobs/${failed.job.id}/retry`);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: 'PENDING', position: 2, songId: failed.song.id });
      const created = await prisma.job.findUniqueOrThrow({ where: { id: response.json().id } });
      expect(created.sourcePath).toBe(failed.sourcePath);
      expect((await prisma.song.findUniqueOrThrow({ where: { id: failed.song.id } })).status).toBe('QUEUED');
    });

    it('retries a canceled YouTube song, which is downloaded again', async () => {
      const canceled = await createJobFixture({ source: 'YOUTUBE', status: 'CANCELED', songStatus: 'ERROR' });
      const response = await post(`/api/jobs/${canceled.job.id}/retry`);
      expect(response.statusCode).toBe(200);
    });

    it('does not retry an upload whose original file is gone', async () => {
      const failed = await createJobFixture({ status: 'FAILED', songStatus: 'ERROR' });
      const response = await post(`/api/jobs/${failed.job.id}/retry`);
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('SOURCE_UNAVAILABLE');
    });

    it('only retries failed or canceled jobs', async () => {
      const done = await createJobFixture({ status: 'DONE' });
      const waiting = await createJobFixture({ position: 2 });

      for (const { job } of [done, waiting]) {
        const response = await post(`/api/jobs/${job.id}/retry`);
        expect(response.statusCode).toBe(409);
        expect(response.json().error.code).toBe('JOB_NOT_RETRYABLE');
      }
    });

    it('does not queue the same song twice', async () => {
      const failed = await createJobFixture({ source: 'YOUTUBE', status: 'FAILED', songStatus: 'ERROR' });
      await post(`/api/jobs/${failed.job.id}/retry`);

      const again = await post(`/api/jobs/${failed.job.id}/retry`);

      expect(again.statusCode).toBe(409);
      expect(again.json().error.code).toBe('JOB_ALREADY_ACTIVE');
      expect(await prisma.job.count({ where: { songId: failed.song.id } })).toBe(2);
    });
  });

  describe('removal', () => {
    it('removes a finished job from the list', async () => {
      const { job } = await createJobFixture({ status: 'FAILED', finishedAt: new Date() });

      const response = await app.inject({ method: 'DELETE', url: `/api/jobs/${job.id}` });

      expect(response.statusCode).toBe(204);
      expect(await prisma.job.count()).toBe(0);
    });

    it('refuses to remove a job that is still active', async () => {
      const { job } = await createJobFixture({ status: 'RUNNING' });

      const response = await app.inject({ method: 'DELETE', url: `/api/jobs/${job.id}` });

      expect(response.statusCode).toBe(409);
      expect(await prisma.job.count()).toBe(1);
    });
  });

  describe('access from phones', () => {
    beforeEach(async () => {
      await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });
    });

    const asPhone = (method: 'GET' | 'POST', url: string) =>
      app.inject({ method, url, remoteAddress: '192.168.0.50', headers: { 'x-access-code': 'ABC234' } });

    it('can see the queue but cannot change it', async () => {
      const { job } = await createJobFixture();

      expect((await asPhone('GET', '/api/jobs')).statusCode).toBe(200);
      expect((await asPhone('POST', `/api/jobs/${job.id}/cancel`)).statusCode).toBe(401);
      expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('PENDING');
    });
  });

  it('leaves the error folder empty when nothing failed', async () => {
    await createJobFixture();
    expect(await listDirectory(storagePaths.errorDir)).toEqual([]);
  });
});
