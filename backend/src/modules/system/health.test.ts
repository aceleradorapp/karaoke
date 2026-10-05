import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createJobFixture, createSong } from '../../../test/fixtures.js';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { recordHeartbeat, resetWorkerStatus } from '../../services/workerStatus.js';
import {
  buildHealthReport,
  clearHealthCache,
  getHealthReport,
  shortError,
  type HealthProbes,
} from './health.js';

const GB = 1024 ** 3;
const NOW = Date.now();

function probes(overrides: Partial<{ internet: boolean; lyrics: boolean; free: number }> = {}): HealthProbes {
  const { internet = true, lyrics = true, free = 50 * GB } = overrides;
  return {
    reach: async (url) => (url.includes('lrclib') ? lyrics : internet),
    freeBytes: async () => free,
    now: () => NOW,
  };
}

const byId = (report: Awaited<ReturnType<typeof buildHealthReport>>, id: string) =>
  report.checks.find((item) => item.id === id);

describe('system health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await resetDatabase();
    resetWorkerStatus();
    clearHealthCache();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const onlineWorker = () =>
    recordHeartbeat(
      {
        device: 'cpu',
        gpuName: null,
        cudaAvailable: false,
        vramMb: null,
        ytdlpVersion: '2026.08.19',
      } as never,
      NOW,
    );

  it('is all green when everything works', async () => {
    onlineWorker();

    const report = await buildHealthReport(probes());

    expect(report.status).toBe('ok');
    expect(report.checks.map((item) => [item.id, item.status])).toEqual([
      ['database', 'ok'],
      ['worker', 'ok'],
      ['internet', 'ok'],
      ['lyrics', 'ok'],
      ['youtube', 'ok'],
      ['disk', 'ok'],
      ['failures', 'ok'],
    ]);
    expect(byId(report, 'youtube')?.message).toContain('2026.08.19');
    expect(report.mode).toBe('dev');
    expect(report.canRestart).toBe(false);
  });

  it('says the song processor is off and what to do', async () => {
    const report = await buildHealthReport(probes());

    expect(report.status).toBe('error');
    expect(byId(report, 'worker')).toMatchObject({ status: 'error' });
    expect(byId(report, 'worker')?.hint).toContain('Reinicie o sistema');
  });

  it('explains when there is no internet and when the lyrics site does not answer', async () => {
    onlineWorker();

    const report = await buildHealthReport(probes({ internet: false, lyrics: false }));

    expect(byId(report, 'internet')).toMatchObject({ status: 'error' });
    expect(byId(report, 'internet')?.message).toContain('Sem internet');
    expect(byId(report, 'lyrics')).toMatchObject({ status: 'warning' });
    expect(byId(report, 'lyrics')?.message).toContain('não respondeu');
  });

  it('counts the songs left without lyrics because the site did not answer', async () => {
    onlineWorker();
    await createSong({ title: 'Sem letra', lyricsNotice: 'SITE_UNREACHABLE' });
    await createSong({ title: 'Não existe', lyricsNotice: 'NOT_FOUND' });

    const report = await buildHealthReport(probes());

    expect(byId(report, 'lyrics')).toMatchObject({ status: 'warning' });
    expect(byId(report, 'lyrics')?.message).toContain('1 música ficou sem letra');
  });

  it('warns about YouTube downloads that failed and suggests updating yt-dlp', async () => {
    onlineWorker();
    const { job } = await createJobFixture({ source: 'YOUTUBE' });
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        step: 'DOWNLOAD',
        finishedAt: new Date(NOW - 1000),
        error: 'StepError: Sign in to confirm you are not a bot\nTraceback...',
      },
    });

    const report = await buildHealthReport(probes());

    expect(byId(report, 'youtube')).toMatchObject({ status: 'warning' });
    expect(byId(report, 'youtube')?.message).toContain('Sign in to confirm you are not a bot');
    expect(byId(report, 'youtube')?.hint).toContain('Atualizar yt-dlp');
  });

  it('groups the other recent failures by step', async () => {
    onlineWorker();
    for (const error of ['SeparationError: demucs crashed', 'SeparationError: out of memory']) {
      const { job } = await createJobFixture();
      await prisma.job.update({
        where: { id: job.id },
        data: { status: 'FAILED', step: 'SEPARATE', finishedAt: new Date(NOW - 5000), error },
      });
    }

    const report = await buildHealthReport(probes());

    expect(byId(report, 'failures')).toMatchObject({ status: 'warning' });
    expect(byId(report, 'failures')?.message).toContain('2 músicas falharam');
    expect(byId(report, 'failures')?.message).toContain('separar a voz: 2');
  });

  it('warns about little disk space and errors when almost full', async () => {
    onlineWorker();
    expect(byId(await buildHealthReport(probes({ free: 3 * GB })), 'disk')).toMatchObject({
      status: 'warning',
    });
    expect(byId(await buildHealthReport(probes({ free: 0.5 * GB })), 'disk')).toMatchObject({
      status: 'error',
    });
  });

  it('tries a second time before saying a site did not answer', async () => {
    onlineWorker();
    let lyricsCalls = 0;
    const flaky: HealthProbes = {
      ...probes(),
      reach: async (url) => (url.includes('lrclib') ? (lyricsCalls += 1) > 1 : true),
    };

    const report = await buildHealthReport(flaky);

    expect(lyricsCalls).toBe(2);
    expect(byId(report, 'lyrics')?.status).toBe('ok');
  });

  it('keeps the report for a minute unless asked to check again', async () => {
    onlineWorker();
    let calls = 0;
    const counting: HealthProbes = { ...probes(), reach: async () => (calls += 1) > 0 };

    await getHealthReport(false, counting);
    await getHealthReport(false, counting);
    expect(calls).toBe(2);

    await getHealthReport(true, counting);
    expect(calls).toBe(4);
  });

  it('is served to the stage only', async () => {
    await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });
    const phone = await app.inject({
      method: 'GET',
      url: '/api/system/health-report',
      remoteAddress: '192.168.0.50',
      headers: { 'x-access-code': 'ABC234' },
    });
    expect(phone.statusCode).toBe(401);
  });

  it('keeps error messages short and readable', () => {
    expect(shortError('StepError: falhou\nlinha 2')).toBe('falhou');
    expect(shortError(null)).toBe('');
    expect(shortError(`x${'a'.repeat(300)}`)).toHaveLength(160);
  });
});
