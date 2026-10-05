import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { emitToAll } from '../../realtime.js';
import { setRestartHandler, SUPERVISED_ENV } from '../../services/lifecycle.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn(), disconnectRoom: vi.fn() }));

describe('restarting the system', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  afterEach(() => {
    delete process.env[SUPERVISED_ENV];
    setRestartHandler(null);
    vi.mocked(emitToAll).mockClear();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const restart = (remoteAddress?: string) =>
    app.inject({ method: 'POST', url: '/api/system/restart', ...(remoteAddress ? { remoteAddress } : {}) });

  it('explains that it only works in party mode', async () => {
    const response = await restart();

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatchObject({ code: 'RESTART_UNAVAILABLE' });
    expect(response.json().error.message).toContain('modo festa');
  });

  it('warns the screens and asks the watcher to restart, after answering', async () => {
    process.env[SUPERVISED_ENV] = '1';
    const handler = vi.fn();
    setRestartHandler(handler);

    const response = await restart();

    expect(response.statusCode).toBe(202);
    expect(vi.mocked(emitToAll)).toHaveBeenCalledWith('system:restarting');
    expect(handler).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1), { timeout: 2000 });
  });

  it('cannot be asked by a phone', async () => {
    process.env[SUPERVISED_ENV] = '1';
    expect((await restart('192.168.0.50')).statusCode).toBe(401);
  });

  it('tells the health report whether restarting is available', async () => {
    process.env[SUPERVISED_ENV] = '1';
    const report = (await app.inject({ method: 'GET', url: '/api/system/health-report?fresh=1' })).json();
    expect(report.canRestart).toBe(true);
  });
});
