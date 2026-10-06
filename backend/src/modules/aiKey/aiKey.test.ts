import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { serverUrls } from './service.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn(), disconnectRoom: vi.fn() }));

const STAGE = '127.0.0.1';
const OTHER_PC = '192.168.0.77';

describe('AI key', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const fromStage = (method: 'GET' | 'POST' | 'DELETE', url: string) =>
    app.inject({ method, url, remoteAddress: STAGE });
  const withKey = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, key: string, payload?: object) =>
    app.inject({
      method,
      url,
      remoteAddress: OTHER_PC,
      headers: { authorization: `Bearer ${key}` },
      ...(payload ? { payload } : {}),
    });

  async function createKey(): Promise<string> {
    const response = await fromStage('POST', '/api/ai-key');
    expect(response.statusCode).toBe(201);
    return response.json().key;
  }

  it('starts without a key and says how the AI can reach the karaoke', async () => {
    const status = (await fromStage('GET', '/api/ai-key')).json();
    expect(status).toMatchObject({ hasKey: false, createdAt: null, mcpDownloadPath: '/downloads/caraoke-mcp.mjs' });
    expect(Array.isArray(status.serverUrls)).toBe(true);
    expect(status.localSetup.url).toBe('http://127.0.0.1:3333');
    expect(status.localSetup.mcpPath).toMatch(/mcp[\\/]dist[\\/]caraoke-mcp\.mjs$/);
    expect(status.localSetup.nodePath).toBe(process.execPath);
  });

  it('creates a key shown only once and keeps just its fingerprint', async () => {
    const key = await createKey();

    expect(key).toMatch(/^ck_[A-Za-z0-9_-]{32}$/);
    const stored = await prisma.setting.findUniqueOrThrow({ where: { key: 'ai.keyHash' } });
    expect(JSON.stringify(stored.value)).not.toContain(key);
    expect((await fromStage('GET', '/api/ai-key')).json()).toMatchObject({ hasKey: true });
    expect((await fromStage('GET', '/api/settings')).json()).not.toHaveProperty('ai.keyHash');
  });

  it('lets another PC with the key use the tools of the MCP', async () => {
    const key = await createKey();

    expect((await withKey('GET', '/api/songs', key)).statusCode).toBe(200);
    expect((await withKey('GET', '/api/jobs', key)).statusCode).toBe(200);
    expect((await withKey('GET', '/api/jobs/estimate', key)).statusCode).toBe(200);
    expect((await withKey('PATCH', '/api/jobs/reorder', key, { ids: [] })).statusCode).toBe(200);
  });

  it('blocks the key everywhere else', async () => {
    const key = await createKey();

    for (const [method, url] of [
      ['GET', '/api/settings'],
      ['GET', '/api/ai-key'],
      ['POST', '/api/ai-key'],
      ['GET', '/api/profiles'],
      ['GET', '/api/sing-queue'],
      ['DELETE', '/api/songs/abc'],
      ['GET', '/media/abc/instrumental.mp3'],
    ] as const) {
      const response = await withKey(method, url, key);
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('rejects a wrong key and stops accepting a revoked or replaced one', async () => {
    const first = await createKey();
    expect((await withKey('GET', '/api/songs', 'ck_errada')).statusCode).toBe(401);

    const second = await createKey();
    expect((await withKey('GET', '/api/songs', first)).statusCode).toBe(401);
    expect((await withKey('GET', '/api/songs', second)).statusCode).toBe(200);

    expect((await fromStage('DELETE', '/api/ai-key')).statusCode).toBe(204);
    const response = await withKey('GET', '/api/songs', second);
    expect(response.statusCode).toBe(401);
    expect(response.json().error.message).toContain('Chave para IA');
  });

  it('builds the addresses with the API port', () => {
    expect(serverUrls(['192.168.0.10'])).toEqual(['http://192.168.0.10:3333']);
  });
});
