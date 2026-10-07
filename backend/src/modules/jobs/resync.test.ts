import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEST_WORKER_TOKEN } from '../../../test/constants.js';
import { createSong, resetStorage } from '../../../test/fixtures.js';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { songDir } from '../../services/storage.js';
import { recoverInterruptedJobs } from './recovery.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn(), disconnectRoom: vi.fn() }));

const WORKER = { 'x-worker-token': TEST_WORKER_TOKEN };
const TIMED = { version: 1, source: 'LRCLIB', synced: true, lines: [{ start: 1, end: 2, text: 'Oi' }] };
const RESULT = {
  durationSec: null,
  hasInstrumental: false,
  hasVocals: false,
  hasCover: false,
  hasMelody: false,
  lyricsSource: 'ALIGNED',
  lyricsNeedsReview: false,
  lyricsOffsetMs: 0,
};

describe('redoing the automatic sync', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await resetDatabase();
    await resetStorage();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function readySong(lyrics: object | null = TIMED) {
    const song = await createSong({ lyricsSource: 'MANUAL', lyricsOffsetMs: 300, hasCover: true, durationSec: 200 });
    await fs.mkdir(songDir(song.id), { recursive: true });
    if (lyrics) await fs.writeFile(path.join(songDir(song.id), 'letra.original.json'), JSON.stringify(lyrics));
    return song;
  }

  const resync = (id: string) => app.inject({ method: 'POST', url: `/api/songs/${id}/lyrics/resync` });
  const claim = () => app.inject({ method: 'POST', url: '/api/internal/jobs/claim', headers: WORKER });

  it('queues a lyrics-only job for this PC, and the song stays ready to sing while it runs', async () => {
    const song = await readySong();

    const response = await resync(song.id);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ kind: 'RESYNC', status: 'PENDING', targetWorkerId: 'local' });

    const claimed = (await claim()).json();
    expect(claimed.job.steps).toEqual(['RESYNC']);
    expect((await prisma.song.findUniqueOrThrow({ where: { id: song.id } })).status).toBe('READY');
  });

  it('updates only the lyrics of the song when it finishes', async () => {
    const song = await readySong();
    const job = (await resync(song.id)).json();
    await claim();

    await app.inject({ method: 'POST', url: `/api/internal/jobs/${job.id}/complete`, headers: WORKER, payload: RESULT });

    const updated = await prisma.song.findUniqueOrThrow({ where: { id: song.id } });
    expect(updated).toMatchObject({
      status: 'READY',
      lyricsSource: 'ALIGNED',
      lyricsOffsetMs: 0,
      hasCover: true,
      hasVocals: true,
      durationSec: 200,
    });
    expect(updated.updatedAt.getTime()).toBeGreaterThan(song.updatedAt.getTime());
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('DONE');
  });

  it('never marks the song as broken when the sync fails, is canceled or is interrupted', async () => {
    const song = await readySong();
    const failing = (await resync(song.id)).json();
    await claim();
    await app.inject({
      method: 'POST',
      url: `/api/internal/jobs/${failing.id}/fail`,
      headers: WORKER,
      payload: { error: 'StepError: sem voz', step: 'RESYNC' },
    });
    expect((await prisma.song.findUniqueOrThrow({ where: { id: song.id } })).status).toBe('READY');

    const retried = await app.inject({ method: 'POST', url: `/api/jobs/${failing.id}/retry` });
    expect(retried.json()).toMatchObject({ kind: 'RESYNC', status: 'PENDING' });

    await app.inject({ method: 'POST', url: `/api/jobs/${retried.json().id}/cancel` });
    expect((await prisma.song.findUniqueOrThrow({ where: { id: song.id } })).status).toBe('READY');

    await resync(song.id);
    await claim();
    await recoverInterruptedJobs();
    expect((await prisma.song.findUniqueOrThrow({ where: { id: song.id } })).status).toBe('READY');
  });

  it('refuses when the song is already in line, has no voice or no timed lyrics', async () => {
    const song = await readySong();
    await resync(song.id);
    expect((await resync(song.id)).json().error.code).toBe('JOB_ALREADY_ACTIVE');

    const withoutVoice = await createSong({ hasVocals: false });
    expect((await resync(withoutVoice.id)).json().error.code).toBe('RESYNC_NOT_POSSIBLE');

    const withoutTimes = await readySong({ ...TIMED, synced: false });
    expect((await resync(withoutTimes.id)).json().error.code).toBe('RESYNC_NOT_POSSIBLE');

    expect((await resync('nao-existe')).statusCode).toBe(404);
  });
});
