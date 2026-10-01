import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { listDirectory, resetStorage } from '../../../test/fixtures.js';
import { buildMultipart, type FormPart } from '../../../test/multipart.js';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { storagePaths } from '../../services/storage.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn() }));

const SMALL_LIMIT_BYTES = 1000;

describe('upload route', () => {
  let app: FastifyInstance;
  let smallLimitApp: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    smallLimitApp = await buildApp({ logger: false, maxUploadBytes: SMALL_LIMIT_BYTES });
  });

  beforeEach(async () => {
    await resetDatabase();
    await resetStorage();
  });

  afterAll(async () => {
    await app.close();
    await smallLimitApp.close();
    await prisma.$disconnect();
  });

  const upload = (
    parts: FormPart[],
    target: FastifyInstance = app,
    extraHeaders = {},
    remoteAddress?: string,
  ) => {
    const { payload, headers } = buildMultipart(parts);
    return target.inject({
      method: 'POST',
      url: '/api/uploads',
      payload,
      headers: { ...headers, ...extraHeaders },
      remoteAddress,
    });
  };
  const audio = (filename: string, content: string | Buffer = 'audio-bytes'): FormPart => ({
    name: 'files',
    filename,
    content,
  });
  const uploadedFiles = async () => (await listDirectory(storagePaths.uploadDir)).sort();

  it('saves the files with safe stored names and a sidecar file with the original name', async () => {
    const response = await upload([audio('Artista - Música.mp3'), audio('Outra.wav')]);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      received: [{ filename: 'Artista - Música.mp3' }, { filename: 'Outra.wav' }],
      rejected: [],
    });

    const files = await uploadedFiles();
    const audioFiles = files.filter((name) => !name.endsWith('.meta.json'));
    expect(audioFiles).toHaveLength(2);
    expect(audioFiles[0]).toMatch(/^\d+-0-Artista-Musica\.mp3$/);
    expect(files.filter((name) => name.endsWith('.part'))).toEqual([]);

    const meta = JSON.parse(
      await fs.readFile(path.join(storagePaths.uploadDir, `${audioFiles[0]}.meta.json`), 'utf-8'),
    );
    expect(meta).toEqual({ originalName: 'Artista - Música.mp3' });
  });

  it('remembers who sent the files, even when the field comes after them', async () => {
    await upload([audio('A - B.mp3'), { name: 'profileId', value: 'profile-1' }]);

    const metaFile = (await uploadedFiles()).find((name) => name.endsWith('.meta.json')) as string;
    const meta = JSON.parse(await fs.readFile(path.join(storagePaths.uploadDir, metaFile), 'utf-8'));
    expect(meta).toMatchObject({ originalName: 'A - B.mp3', profileId: 'profile-1' });
  });

  it('only stores the files; the watcher is the one that creates the songs', async () => {
    await upload([audio('A - B.mp3')]);
    expect(await prisma.song.count()).toBe(0);
  });

  it('accepts the supported files and reports the rest', async () => {
    const response = await upload([audio('ok.mp3'), audio('virus.exe'), audio('notes.txt')]);

    expect(response.statusCode).toBe(201);
    expect(response.json().received).toEqual([{ filename: 'ok.mp3' }]);
    expect(response.json().rejected).toEqual([
      { filename: 'virus.exe', reason: 'UNSUPPORTED_TYPE' },
      { filename: 'notes.txt', reason: 'UNSUPPORTED_TYPE' },
    ]);
    expect((await uploadedFiles()).filter((name) => !name.endsWith('.meta.json'))).toHaveLength(1);
  });

  it('answers 400 when no file is accepted', async () => {
    const response = await upload([audio('notes.txt')]);

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('UNSUPPORTED_FILE');
    expect(response.json().error.details.rejected).toHaveLength(1);
    expect(await uploadedFiles()).toEqual([]);
  });

  it('rejects files above the size limit and cleans up the partial file', async () => {
    const response = await upload(
      [audio('big.mp3', Buffer.alloc(SMALL_LIMIT_BYTES * 5)), audio('small.mp3', 'tiny')],
      smallLimitApp,
    );

    expect(response.statusCode).toBe(201);
    expect(response.json().rejected).toEqual([{ filename: 'big.mp3', reason: 'FILE_TOO_LARGE' }]);
    expect(response.json().received).toEqual([{ filename: 'small.mp3' }]);
    expect((await uploadedFiles()).filter((name) => name.includes('big'))).toEqual([]);
  });

  it('refuses more than 10 files at once and leaves nothing behind', async () => {
    const response = await upload(Array.from({ length: 11 }, (_, index) => audio(`song${index}.mp3`)));

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('TOO_MANY_FILES');
    expect(await uploadedFiles()).toEqual([]);
  });

  it('asks for a multipart form', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/uploads', payload: { a: 1 } });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('NOT_MULTIPART');
  });

  it('is available to phones that have the access code', async () => {
    await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });

    const allowed = await upload([audio('A - B.mp3')], app, { 'x-access-code': 'ABC234' }, '192.168.0.50');
    const denied = await upload([audio('C - D.mp3')], app, {}, '192.168.0.50');

    expect(allowed.statusCode).toBe(201);
    expect(denied.statusCode).toBe(401);
  });
});
