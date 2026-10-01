import fs from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJobFixture, fileExists, listDirectory, resetStorage } from '../../../test/fixtures.js';
import { resetDatabase } from '../../../test/database.js';
import { TEST_WORKER_TOKEN } from '../../../test/constants.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { emitToAll } from '../../realtime.js';
import { songDir, storagePaths } from '../../services/storage.js';
import { recordProgress } from './workerService.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn() }));

const HEADERS = { 'x-worker-token': TEST_WORKER_TOKEN };

const COMPLETE_BODY = {
  durationSec: 215,
  hasInstrumental: true,
  hasVocals: true,
  hasCover: true,
  hasMelody: false,
  lyricsSource: 'LRCLIB',
  lyricsNeedsReview: false,
};

describe('worker job routes', () => {
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

  const send = (method: 'PATCH' | 'POST', url: string, payload: Record<string, unknown>) =>
    app.inject({ method, url, headers: HEADERS, payload });
  const progress = (id: string, payload: Record<string, unknown>) =>
    send('PATCH', `/api/internal/jobs/${id}/progress`, payload);
  const complete = (id: string, payload: Record<string, unknown> = COMPLETE_BODY) =>
    send('POST', `/api/internal/jobs/${id}/complete`, payload);
  const fail = (id: string, payload: Record<string, unknown>) =>
    send('POST', `/api/internal/jobs/${id}/fail`, payload);
  const storedJob = (id: string) => prisma.job.findUniqueOrThrow({ where: { id } });
  const storedSong = (id: string) => prisma.song.findUniqueOrThrow({ where: { id } });

  describe('progress', () => {
    it('stores the step, progress, message and device and keeps working', async () => {
      const { job } = await createJobFixture({ status: 'RUNNING' });

      const response = await progress(job.id, {
        step: 'SEPARATE',
        progress: 37,
        message: 'Separando voz (CPU)… 37%',
        device: 'cpu',
      });

      expect(response.json()).toEqual({ cancel: false });
      expect(await storedJob(job.id)).toMatchObject({
        step: 'SEPARATE',
        progress: 37,
        message: 'Separando voz (CPU)… 37%',
        device: 'cpu',
      });
    });

    it('tells the worker to stop when the job is not running anymore or does not exist', async () => {
      const waiting = await createJobFixture();
      const body = { step: 'DOWNLOAD', progress: 1, message: null };

      expect((await progress(waiting.job.id, body)).json()).toEqual({ cancel: true });
      expect((await progress('unknown', body)).json()).toEqual({ cancel: true });
      expect((await storedJob(waiting.job.id)).progress).toBe(0);
    });

    it('validates the body', async () => {
      const { job } = await createJobFixture({ status: 'RUNNING' });
      const invalidBodies = [
        { step: 'NOPE', progress: 1, message: null },
        { step: 'SEPARATE', progress: 101, message: null },
        { step: 'SEPARATE', progress: -1, message: null },
        { step: 'SEPARATE', progress: 1.5, message: null },
      ];
      for (const body of invalidBodies) {
        expect((await progress(job.id, body)).statusCode).toBe(400);
      }
    });

    it('publishes at most one update every 500 ms, but always on a step change or at 100%', async () => {
      const { job } = await createJobFixture({ status: 'RUNNING' });
      const published = () => vi.mocked(emitToAll).mock.calls.length;
      const input = (step: 'DOWNLOAD' | 'SEPARATE', value: number) => ({
        step,
        progress: value,
        message: null,
      });

      await recordProgress(job.id, input('SEPARATE', 10), 1_000);
      await recordProgress(job.id, input('SEPARATE', 11), 1_200);
      await recordProgress(job.id, input('SEPARATE', 12), 1_499);
      expect(published()).toBe(1);

      await recordProgress(job.id, input('SEPARATE', 13), 1_500);
      expect(published()).toBe(2);

      await recordProgress(job.id, input('DOWNLOAD', 5), 1_600);
      expect(published()).toBe(3);

      await recordProgress(job.id, input('DOWNLOAD', 100), 1_700);
      expect(published()).toBe(4);
    });
  });

  describe('complete', () => {
    it('marks the job done and the song ready with what the worker produced', async () => {
      const { job, song } = await createJobFixture({ status: 'RUNNING', songStatus: 'PROCESSING' });

      const response = await complete(job.id);

      expect(response.json()).toEqual({ ok: true });
      expect(await storedJob(job.id)).toMatchObject({ status: 'DONE', progress: 100 });
      expect((await storedJob(job.id)).finishedAt).not.toBeNull();
      expect(await storedSong(song.id)).toMatchObject({
        status: 'READY',
        durationSec: 215,
        hasInstrumental: true,
        hasVocals: true,
        hasCover: true,
        hasMelody: false,
        lyricsSource: 'LRCLIB',
        lyricsNeedsReview: false,
      });
      expect(vi.mocked(emitToAll).mock.calls.map(([event]) => event)).toEqual([
        'job:updated',
        'song:updated',
      ]);
    });

    it('stores the lyrics offset the worker found by listening to the vocals', async () => {
      const { job, song } = await createJobFixture({ status: 'RUNNING', songStatus: 'PROCESSING' });

      await complete(job.id, { ...COMPLETE_BODY, lyricsOffsetMs: 15410 });

      expect(await storedSong(song.id)).toMatchObject({ lyricsOffsetMs: 15410 });
    });

    it('keeps the offset the user already set when the worker sends none', async () => {
      const { job, song } = await createJobFixture({ status: 'RUNNING', songStatus: 'PROCESSING' });
      await prisma.song.update({ where: { id: song.id }, data: { lyricsOffsetMs: 700 } });

      await complete(job.id);

      expect(await storedSong(song.id)).toMatchObject({ lyricsOffsetMs: 700 });
    });

    it('rejects an offset beyond the allowed limit', async () => {
      const { job } = await createJobFixture({ status: 'RUNNING', songStatus: 'PROCESSING' });

      const response = await complete(job.id, { ...COMPLETE_BODY, lyricsOffsetMs: 60001 });

      expect(response.statusCode).toBe(400);
    });

    it('deletes the original file after processing', async () => {
      const { job, sourcePath } = await createJobFixture({ status: 'RUNNING', withOriginFile: true });

      await complete(job.id);

      expect(await fileExists(sourcePath as string)).toBe(false);
      expect(await listDirectory(storagePaths.errorDir)).toEqual([]);
    });

    it('never deletes a file outside the storage folder', async () => {
      const { job } = await createJobFixture({ status: 'RUNNING' });
      const outside = `${storagePaths.root}-outside.txt`;
      await fs.writeFile(outside, 'keep me');
      await prisma.job.update({ where: { id: job.id }, data: { sourcePath: outside } });

      await complete(job.id);

      expect(await fileExists(outside)).toBe(true);
      await fs.rm(outside, { force: true });
    });

    it('discards the results of a job that was canceled meanwhile', async () => {
      const { job, song, sourcePath } = await createJobFixture({
        status: 'CANCELED',
        songStatus: 'ERROR',
        withOriginFile: true,
      });
      await fs.mkdir(songDir(song.id), { recursive: true });
      await fs.writeFile(`${songDir(song.id)}/instrumental.mp3`, 'x');

      const response = await complete(job.id);

      expect(response.statusCode).toBe(200);
      expect((await storedJob(job.id)).status).toBe('CANCELED');
      expect((await storedSong(song.id)).status).toBe('ERROR');
      expect(await fileExists(songDir(song.id))).toBe(false);
      expect(await fileExists(sourcePath as string)).toBe(false);
      expect(await listDirectory(storagePaths.errorDir)).toHaveLength(1);
    });

    it('validates the body and answers 404 for unknown jobs', async () => {
      const { job } = await createJobFixture({ status: 'RUNNING' });

      expect((await complete(job.id, { ...COMPLETE_BODY, lyricsSource: 'NOPE' })).statusCode).toBe(400);
      expect((await complete(job.id, { durationSec: 1 })).statusCode).toBe(400);
      expect((await complete('unknown')).statusCode).toBe(404);
      expect((await storedJob(job.id)).status).toBe('RUNNING');
    });
  });

  describe('fail', () => {
    it('marks the job failed, the song with error and moves the original to the error folder', async () => {
      const { job, song, sourcePath } = await createJobFixture({
        status: 'RUNNING',
        songStatus: 'PROCESSING',
        withOriginFile: true,
      });

      const response = await fail(job.id, { error: 'RuntimeError: boom', step: 'SEPARATE' });

      expect(response.json()).toEqual({ ok: true });
      const stored = await storedJob(job.id);
      expect(stored).toMatchObject({ status: 'FAILED', error: 'RuntimeError: boom', step: 'SEPARATE' });
      expect((await storedSong(song.id)).status).toBe('ERROR');
      expect(await fileExists(sourcePath as string)).toBe(false);
      expect(await fileExists(stored.sourcePath as string)).toBe(true);
    });

    it('acknowledges a canceled job by moving its original out of the way, keeping it canceled', async () => {
      const { job, sourcePath } = await createJobFixture({
        status: 'CANCELED',
        songStatus: 'ERROR',
        withOriginFile: true,
      });

      await fail(job.id, { error: 'CANCELED' });

      const stored = await storedJob(job.id);
      expect(stored.status).toBe('CANCELED');
      expect(await fileExists(sourcePath as string)).toBe(false);
      expect(await fileExists(stored.sourcePath as string)).toBe(true);
    });

    it('ignores a failure report for a job that already finished', async () => {
      const { job, song } = await createJobFixture({ status: 'DONE', songStatus: 'READY' });

      await fail(job.id, { error: 'late' });

      expect((await storedJob(job.id)).status).toBe('DONE');
      expect((await storedSong(song.id)).status).toBe('READY');
    });

    it('validates the body and answers 404 for unknown jobs', async () => {
      const { job } = await createJobFixture({ status: 'RUNNING' });
      expect((await fail(job.id, { step: 'SEPARATE' })).statusCode).toBe(400);
      expect((await fail(job.id, { error: 'x'.repeat(2001) })).statusCode).toBe(400);
      expect((await fail('unknown', { error: 'x' })).statusCode).toBe(404);
    });
  });

  it('requires the worker token on every internal job route', async () => {
    const { job } = await createJobFixture({ status: 'RUNNING' });
    const calls = [
      { method: 'PATCH' as const, url: `/api/internal/jobs/${job.id}/progress` },
      { method: 'POST' as const, url: `/api/internal/jobs/${job.id}/complete` },
      { method: 'POST' as const, url: `/api/internal/jobs/${job.id}/fail` },
    ];
    for (const call of calls) {
      expect((await app.inject({ ...call, payload: {} })).statusCode).toBe(401);
    }
  });
});
