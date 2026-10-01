import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { env } from '../../env.js';
import { runCommand } from '../../services/commands.js';

vi.mock('../../services/commands.js', () => ({ runCommand: vi.fn() }));

const runCommandMock = vi.mocked(runCommand);

describe('yt-dlp update route', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await resetDatabase();
    runCommandMock.mockReset();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const update = (remoteAddress?: string, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url: '/api/system/ytdlp/update', remoteAddress, headers });

  it('upgrades the package with pip and then reports the installed version', async () => {
    runCommandMock
      .mockResolvedValueOnce('Successfully installed yt-dlp')
      .mockResolvedValueOnce('2026.10.05\n');

    const response = await update();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ version: '2026.10.05' });
    expect(runCommandMock).toHaveBeenNthCalledWith(
      1,
      env.PYTHON_PATH,
      ['-m', 'pip', 'install', '-U', 'yt-dlp'],
      {
        timeoutMs: expect.any(Number),
      },
    );
    expect(runCommandMock).toHaveBeenNthCalledWith(2, env.YTDLP_PATH, ['--version'], {
      timeoutMs: expect.any(Number),
    });
  });

  it('answers 502 with a clear message when pip fails and does not check the version', async () => {
    runCommandMock.mockRejectedValueOnce(new Error('pip failed'));

    const response = await update();

    expect(response.statusCode).toBe(502);
    expect(response.json().error).toMatchObject({
      code: 'YTDLP_UPDATE_FAILED',
      message: 'Não foi possível atualizar o yt-dlp',
    });
    expect(runCommandMock).toHaveBeenCalledTimes(1);
  });

  it('answers 502 when the version cannot be read afterwards', async () => {
    runCommandMock.mockResolvedValueOnce('ok').mockRejectedValueOnce(new Error('missing binary'));

    const response = await update();

    expect(response.statusCode).toBe(502);
  });

  it('is not available to phones', async () => {
    await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });

    const response = await update('192.168.0.50', { 'x-access-code': 'ABC234' });

    expect(response.statusCode).toBe(401);
    expect(runCommandMock).not.toHaveBeenCalled();
  });
});
