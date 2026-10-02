import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetStorage } from '../../../test/fixtures.js';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { songDir, storagePaths } from '../../services/storage.js';

const COVER_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe('media files', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await resetDatabase();
    await resetStorage();
    await fs.mkdir(songDir('song1'), { recursive: true });
    await fs.writeFile(path.join(songDir('song1'), 'capa.jpg'), COVER_BYTES);
    await fs.writeFile(path.join(songDir('song1'), 'instrumental.mp3'), 'audio-bytes');
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const get = (url: string, remoteAddress?: string, headers: Record<string, string> = {}) =>
    app.inject({ method: 'GET', url, remoteAddress, headers });

  it('serves the files of a song to the stage', async () => {
    const cover = await get('/media/song1/capa.jpg');

    expect(cover.statusCode).toBe(200);
    expect(cover.headers['content-type']).toBe('image/jpeg');
    expect(cover.rawPayload.equals(COVER_BYTES)).toBe(true);

    const audio = await get('/media/song1/instrumental.mp3');
    expect(audio.statusCode).toBe(200);
    expect(audio.headers['content-type']).toBe('audio/mpeg');
  });

  it('supports range requests, which audio players use for seeking', async () => {
    const response = await get('/media/song1/instrumental.mp3', undefined, { range: 'bytes=0-4' });

    expect(response.statusCode).toBe(206);
    expect(response.body).toBe('audio');
  });

  it('answers 404 for files that do not exist', async () => {
    expect((await get('/media/song1/missing.jpg')).statusCode).toBe(404);
    expect((await get('/media/unknown-song/capa.jpg')).statusCode).toBe(404);
  });

  it('does not list the library folders', async () => {
    for (const url of ['/media/', '/media/song1/']) {
      const response = await get(url);
      expect([403, 404]).toContain(response.statusCode);
      expect(response.body).not.toContain('capa.jpg');
    }
  });

  it('does not escape the library folder', async () => {
    await fs.writeFile(path.join(storagePaths.root, 'secret.txt'), 'secret');

    for (const url of [
      '/media/../secret.txt',
      '/media/%2e%2e/secret.txt',
      '/media/song1/..%2f..%2fsecret.txt',
    ]) {
      const response = await get(url);
      expect(response.statusCode).not.toBe(200);
      expect(response.body).not.toContain('secret');
    }
  });

  it('keeps the audio away from phones, even with the access code', async () => {
    await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });

    const response = await get('/media/song1/instrumental.mp3', '192.168.0.50', {
      'x-access-code': 'ABC234',
    });

    expect(response.statusCode).toBe(401);
  });

  it('shows the cover to a phone that has the access code', async () => {
    await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });

    const response = await get('/media/song1/capa.jpg?c=ABC234', '192.168.0.50');

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload.equals(COVER_BYTES)).toBe(true);
  });
});
