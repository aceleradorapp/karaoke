import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { disconnectRoom, emitToRoom } from '../../realtime.js';
import { buildAccessUrls } from './access.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn(), disconnectRoom: vi.fn() }));

const PHONE = { remoteAddress: '192.168.0.50' };
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

describe('system access routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(emitToRoom).mockClear();
    vi.mocked(disconnectRoom).mockClear();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const storedCode = async () =>
    (await prisma.setting.findUnique({ where: { key: 'access.code' } }))?.value as string | undefined;

  describe('on the stage', () => {
    it('creates the access code when there is none and keeps it', async () => {
      const first = (await app.inject({ method: 'GET', url: '/api/system/access' })).json();
      const second = (await app.inject({ method: 'GET', url: '/api/system/access' })).json();

      expect(first.code).toMatch(CODE_PATTERN);
      expect(second.code).toBe(first.code);
      expect(await storedCode()).toBe(first.code);
      expect(Array.isArray(first.urls)).toBe(true);
    });

    it('returns the code that already exists', async () => {
      await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });
      expect((await app.inject({ method: 'GET', url: '/api/system/access' })).json().code).toBe('ABC234');
    });

    it('creates a new code, tells the phones and disconnects them', async () => {
      await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });

      const response = await app.inject({ method: 'POST', url: '/api/system/access/regenerate' });

      expect(response.statusCode).toBe(200);
      const { code } = response.json();
      expect(code).toMatch(CODE_PATTERN);
      expect(code).not.toBe('ABC234');
      expect(await storedCode()).toBe(code);
      expect(vi.mocked(emitToRoom)).toHaveBeenCalledWith('mobile', 'access:changed');
      expect(vi.mocked(disconnectRoom)).toHaveBeenCalledWith('mobile');
    });
  });

  describe('on the phone', () => {
    beforeEach(async () => {
      await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });
    });

    const fromPhone = (method: 'GET' | 'POST', url: string, code?: string) =>
      app.inject({ method, url, ...PHONE, headers: code ? { 'x-access-code': code } : {} });

    it('confirms a valid code', async () => {
      const response = await fromPhone('GET', '/api/system/access/check', 'ABC234');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
    });

    it('refuses a wrong or missing code with a clear message', async () => {
      const wrong = await fromPhone('GET', '/api/system/access/check', 'ZZZ999');
      expect(wrong.statusCode).toBe(401);
      expect(wrong.json().error.message).toContain('Escaneie o QR code novamente');
      expect((await fromPhone('GET', '/api/system/access/check')).statusCode).toBe(401);
    });

    it('stops accepting the old code once a new one is created', async () => {
      await app.inject({ method: 'POST', url: '/api/system/access/regenerate' });
      expect((await fromPhone('GET', '/api/system/access/check', 'ABC234')).statusCode).toBe(401);
    });

    it('never sees the code nor creates a new one, even with a valid code', async () => {
      expect((await fromPhone('GET', '/api/system/access', 'ABC234')).statusCode).toBe(401);
      expect((await fromPhone('POST', '/api/system/access/regenerate', 'ABC234')).statusCode).toBe(401);
      expect(await storedCode()).toBe('ABC234');
    });
  });
});

describe('buildAccessUrls', () => {
  it('builds one phone address per network address, with the code', () => {
    expect(buildAccessUrls('K7P2QX', ['192.168.98.10', '10.0.0.5'])).toEqual([
      'http://192.168.98.10:5173/m?c=K7P2QX',
      'http://10.0.0.5:5173/m?c=K7P2QX',
    ]);
  });

  it('returns no address when the PC is not on a network', () => {
    expect(buildAccessUrls('K7P2QX', [])).toEqual([]);
  });
});
