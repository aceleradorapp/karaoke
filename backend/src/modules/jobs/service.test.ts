import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../db.js';
import { resetDatabase } from '../../../test/database.js';
import { claimNextJob } from './service.js';

async function createSongWithJob(title: string, position: number, source: 'YOUTUBE' | 'UPLOAD' = 'UPLOAD') {
  const song = await prisma.song.create({ data: { title, artist: 'Artist', source, status: 'QUEUED' } });
  const job = await prisma.job.create({
    data: { songId: song.id, position, sourcePath: `C:\\in\\${title}.mp3` },
  });
  return { song, job };
}

describe('claimNextJob', () => {
  beforeEach(resetDatabase);
  afterAll(() => prisma.$disconnect());

  it('returns null when the queue is empty', async () => {
    expect(await claimNextJob()).toBeNull();
  });

  it('claims the pending job with the lowest position', async () => {
    await createSongWithJob('second', 2);
    const first = await createSongWithJob('first', 1, 'YOUTUBE');

    const claim = await claimNextJob();

    expect(claim?.job.id).toBe(first.job.id);
    expect(claim?.job.steps[0]).toBe('DOWNLOAD');
    expect(claim?.job.song.title).toBe('first');
  });

  it('marks the job as running and the song as processing', async () => {
    const { song, job } = await createSongWithJob('only', 1);

    await claimNextJob();

    const updatedJob = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    const updatedSong = await prisma.song.findUniqueOrThrow({ where: { id: song.id } });
    expect(updatedJob.status).toBe('RUNNING');
    expect(updatedJob.attempts).toBe(1);
    expect(updatedJob.startedAt).not.toBeNull();
    expect(updatedSong.status).toBe('PROCESSING');
  });

  it('never hands the same job to two workers', async () => {
    await createSongWithJob('only', 1);

    const claims = await Promise.all([claimNextJob(), claimNextJob(), claimNextJob()]);

    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
  });

  it('skips jobs that are already running', async () => {
    const running = await createSongWithJob('running', 1);
    await prisma.job.update({ where: { id: running.job.id }, data: { status: 'RUNNING' } });
    const pending = await createSongWithJob('pending', 2);

    const claim = await claimNextJob();

    expect(claim?.job.id).toBe(pending.job.id);
  });
});
