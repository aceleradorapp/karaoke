import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';

describe('GET /downloads/:file', () => {
  let app: FastifyInstance;
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'downloads-'));
    await fs.writeFile(path.join(dir, 'caraoke-mcp.mjs'), 'console.log("mcp")');
    app = await buildApp({
      logger: false,
      downloadFiles: {
        'caraoke-mcp.mjs': path.join(dir, 'caraoke-mcp.mjs'),
        'Processador-do-Karaoke.zip': path.join(dir, 'nao-gerado.zip'),
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('lets any computer of the house download the MCP file, without a code', async () => {
    const response = await app.inject({ method: 'GET', url: '/downloads/caraoke-mcp.mjs', remoteAddress: '192.168.0.77' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('console.log("mcp")');
    expect(response.headers['content-disposition']).toBe('attachment; filename="caraoke-mcp.mjs"');
  });

  it('says when the file was not generated yet and refuses unknown names', async () => {
    const missing = await app.inject({ method: 'GET', url: '/downloads/Processador-do-Karaoke.zip' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.message).toContain('ainda não gerado');

    expect((await app.inject({ method: 'GET', url: '/downloads/..%2F.env' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/downloads/toString' })).statusCode).toBe(404);
  });
});
