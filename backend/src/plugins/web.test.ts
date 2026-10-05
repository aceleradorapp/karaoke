import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { prisma } from '../db.js';
import { hasBuiltWeb } from './web.js';

const INDEX_HTML = '<!doctype html><html><body><div id="root"></div></body></html>';
const BIG_SCRIPT = `console.log(${JSON.stringify('karaoke '.repeat(2000))});`;

describe('serving the built web app (party mode)', () => {
  let app: FastifyInstance;
  let distDir: string;

  beforeAll(async () => {
    distDir = await fs.mkdtemp(path.join(os.tmpdir(), 'caraoke-dist-'));
    await fs.mkdir(path.join(distDir, 'assets'));
    await fs.writeFile(path.join(distDir, 'index.html'), INDEX_HTML);
    await fs.writeFile(path.join(distDir, 'assets', 'index-abc123.js'), BIG_SCRIPT);
    await fs.writeFile(path.join(distDir, 'keep-awake.mp4'), Buffer.from([0, 0, 0, 1]));
    app = await buildApp({ logger: false, webDistDir: distDir });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    await fs.rm(distDir, { recursive: true, force: true });
  });

  const get = (url: string, headers: Record<string, string> = {}, remoteAddress?: string) =>
    app.inject({ method: 'GET', url, headers, remoteAddress });

  it('serves the page at the root and for any app route, without caching it', async () => {
    for (const url of ['/', '/m?c=ABC234', '/m/musicas', '/disputas/abc']) {
      const response = await get(url);
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.body).toContain('<div id="root">');
    }
  });

  it('opens the page for a phone without the access code, like before', async () => {
    const response = await get('/m', {}, '192.168.0.50');
    expect(response.statusCode).toBe(200);
  });

  it('keeps the hashed files in the cache for a year and compresses them', async () => {
    const response = await get('/assets/index-abc123.js', { 'accept-encoding': 'br, gzip' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(response.headers['content-encoding']).toBe('br');
    expect(response.rawPayload.length).toBeLessThan(BIG_SCRIPT.length / 10);
  });

  it('serves the other public files', async () => {
    const response = await get('/keep-awake.mp4');
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-cache');
  });

  it('still answers JSON for unknown API routes and protects the API', async () => {
    const unknown = await get('/api/nao-existe');
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe('ROUTE_NOT_FOUND');

    const phone = await get('/api/jobs', {}, '192.168.0.50');
    expect(phone.statusCode).toBe(401);
  });

  it('knows when there is no built app', async () => {
    expect(hasBuiltWeb(distDir)).toBe(true);
    expect(hasBuiltWeb(path.join(distDir, 'nada'))).toBe(false);
  });
});
