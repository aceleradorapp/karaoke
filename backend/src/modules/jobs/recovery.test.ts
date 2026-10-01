import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createJobFixture } from '../../../test/fixtures.js';
import { resetDatabase } from '../../../test/database.js';
import { prisma } from '../../db.js';
import { MAX_JOB_ATTEMPTS, recoverInterruptedJobs } from './recovery.js';

describe('recoverInterruptedJobs', () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it('does nothing when no job was interrupted', async () => {
    await createJobFixture();
    expect(await recoverInterruptedJobs()).toEqual({ requeued: 0, gaveUp: 0 });
  });

  it('puts interrupted jobs back in the queue and resets their progress', async () => {
    const { job, song } = await createJobFixture({
      status: 'RUNNING',
      songStatus: 'PROCESSING',
      attempts: 1,
    });
    await prisma.job.update({
      where: { id: job.id },
      data: { step: 'SEPARATE', progress: 60, message: 'Separando', device: 'cpu', startedAt: new Date() },
    });

    const result = await recoverInterruptedJobs();

    expect(result).toEqual({ requeued: 1, gaveUp: 0 });
    expect(await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: 'PENDING',
      step: null,
      progress: 0,
      message: null,
      device: null,
      startedAt: null,
      attempts: 1,
    });
    expect((await prisma.song.findUniqueOrThrow({ where: { id: song.id } })).status).toBe('QUEUED');
  });

  it('gives up on a job that keeps getting interrupted', async () => {
    const { job, song } = await createJobFixture({
      status: 'RUNNING',
      songStatus: 'PROCESSING',
      attempts: MAX_JOB_ATTEMPTS,
    });

    const result = await recoverInterruptedJobs();

    expect(result).toEqual({ requeued: 0, gaveUp: 1 });
    const stored = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.status).toBe('FAILED');
    expect(stored.error).toContain('Interrompida');
    expect(stored.finishedAt).not.toBeNull();
    expect((await prisma.song.findUniqueOrThrow({ where: { id: song.id } })).status).toBe('ERROR');
  });

  it('leaves waiting and finished jobs untouched', async () => {
    const waiting = await createJobFixture({ position: 1 });
    const done = await createJobFixture({ status: 'DONE', songStatus: 'READY', position: 2 });

    await recoverInterruptedJobs();

    expect((await prisma.job.findUniqueOrThrow({ where: { id: waiting.job.id } })).status).toBe('PENDING');
    expect((await prisma.job.findUniqueOrThrow({ where: { id: done.job.id } })).status).toBe('DONE');
    expect((await prisma.song.findUniqueOrThrow({ where: { id: done.song.id } })).status).toBe('READY');
  });

  it('handles requeued and abandoned jobs together', async () => {
    await createJobFixture({ status: 'RUNNING', position: 1, attempts: 1 });
    await createJobFixture({ status: 'RUNNING', position: 2, attempts: MAX_JOB_ATTEMPTS });

    expect(await recoverInterruptedJobs()).toEqual({ requeued: 1, gaveUp: 1 });
  });
});
