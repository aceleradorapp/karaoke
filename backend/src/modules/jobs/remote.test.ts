import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJobFixture, resetStorage } from '../../../test/fixtures.js';
import { resetDatabase } from '../../../test/database.js';
import { buildMultipart } from '../../../test/multipart.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { songDir } from '../../services/storage.js';
import { resetWorkerStatus } from '../../services/workerStatus.js';
import { resetPairing } from '../workers/service.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn(), disconnectRoom: vi.fn() }));

const OTHER_PC = '192.168.0.42';

describe('processing on another machine', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await resetDatabase();
    await resetStorage();
    resetPairing();
    resetWorkerStatus();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function pair(name: string) {
    const { code } = (await app.inject({ method: 'POST', url: '/api/workers/pairing' })).json();
    return (
      await app.inject({ method: 'POST', url: '/api/workers/pair', remoteAddress: OTHER_PC, payload: { code, name } })
    ).json() as { workerId: string; token: string };
  }

  const asWorker = (token: string, method: 'GET' | 'POST', url: string, extra: object = {}) =>
    app.inject({ method, url, remoteAddress: OTHER_PC, headers: { 'x-worker-token': token }, ...extra });

  it('hands the original upload to the machine and stores the finished files it sends back', async () => {
    const { token } = await pair('Notebook GPU');
    const { song, job } = await createJobFixture({ withOriginFile: true });
    await asWorker(token, 'POST', '/api/internal/jobs/claim');

    const source = await asWorker(token, 'GET', `/api/internal/jobs/${job.id}/source`);
    expect(source.statusCode).toBe(200);
    expect(source.body).toBe('audio');
    expect(source.headers['content-disposition']).toContain(`${song.id}.mp3`);

    const { payload, headers } = buildMultipart([
      { name: 'files', filename: 'instrumental.mp3', content: 'inst' },
      { name: 'files', filename: 'voz.mp3', content: 'voz' },
      { name: 'files', filename: 'letra.json', content: '{"lines":[]}', contentType: 'application/json' },
    ]);
    const upload = await app.inject({
      method: 'POST',
      url: `/api/internal/songs/${song.id}/files`,
      remoteAddress: OTHER_PC,
      headers: { ...headers, 'x-worker-token': token },
      payload,
    });

    expect(upload.statusCode).toBe(200);
    expect(upload.json().saved).toEqual(['instrumental.mp3', 'voz.mp3', 'letra.json']);
    expect(await fs.readFile(path.join(songDir(song.id), 'voz.mp3'), 'utf8')).toBe('voz');
    expect(await fs.readdir(songDir(song.id))).not.toContain('voz.mp3.parte');
  });

  it('refuses files of a song another machine is processing, and unexpected file names', async () => {
    const first = await pair('A');
    const second = await pair('B');
    const { song, job } = await createJobFixture({ withOriginFile: true });
    await asWorker(first.token, 'POST', '/api/internal/jobs/claim');

    expect((await asWorker(second.token, 'GET', `/api/internal/jobs/${job.id}/source`)).statusCode).toBe(409);

    const stranger = buildMultipart([{ name: 'files', filename: 'voz.mp3', content: 'x' }]);
    const wrongMachine = await app.inject({
      method: 'POST',
      url: `/api/internal/songs/${song.id}/files`,
      headers: { ...stranger.headers, 'x-worker-token': second.token },
      payload: stranger.payload,
    });
    expect(wrongMachine.statusCode).toBe(409);

    const sneaky = buildMultipart([{ name: 'files', filename: '../../.env', content: 'x' }]);
    const badName = await app.inject({
      method: 'POST',
      url: `/api/internal/songs/${song.id}/files`,
      headers: { ...sneaky.headers, 'x-worker-token': first.token },
      payload: sneaky.payload,
    });
    expect(badName.statusCode).toBe(400);
  });

  it('lets the family choose where a waiting song is processed', async () => {
    const { workerId } = await pair('Notebook GPU');
    const { job } = await createJobFixture();

    const choose = (targetWorkerId: string | null) =>
      app.inject({ method: 'PATCH', url: `/api/jobs/${job.id}/target`, payload: { targetWorkerId } });

    expect((await choose(workerId)).statusCode).toBe(204);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).targetWorkerId).toBe(workerId);
    expect((await choose('local')).statusCode).toBe(204);
    expect((await choose(null)).statusCode).toBe(204);
    expect((await choose('nao-existe')).statusCode).toBe(404);

    await prisma.job.update({ where: { id: job.id }, data: { status: 'RUNNING' } });
    expect((await choose('local')).statusCode).toBe(409);
  });

  it('imports a YouTube song straight to a chosen machine', async () => {
    const { workerId } = await pair('Notebook GPU');

    const response = await app.inject({
      method: 'POST',
      url: '/api/youtube/import',
      payload: { youtubeId: 'abcdefghijk', title: 'Flores', artist: 'Titãs', targetWorkerId: workerId },
    });

    expect(response.statusCode).toBe(201);
    const job = await prisma.job.findFirstOrThrow({ where: { songId: response.json().song.id } });
    expect(job.targetWorkerId).toBe(workerId);
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/youtube/import',
      payload: { youtubeId: 'zzzzzzzzzzz', title: 'X', artist: 'Y', targetWorkerId: 'nao-existe' },
    });
    expect(unknown.statusCode).toBe(404);
  });
});
