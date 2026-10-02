import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { emitToAll } from '../../realtime.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn() }));

const VALID_BODY = { youtubeId: 'abc123DEF_-', title: '  Evidências  ', artist: 'Chitãozinho & Xororó' };

describe('youtube import route', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(emitToAll).mockClear();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const importVideo = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/api/youtube/import', payload });

  it('creates a queued song and a pending job', async () => {
    const response = await importVideo(VALID_BODY);

    expect(response.statusCode).toBe(201);
    const { song, alreadyExists } = response.json();
    expect(alreadyExists).toBe(false);
    expect(song).toMatchObject({
      title: 'Evidências',
      artist: 'Chitãozinho & Xororó',
      source: 'YOUTUBE',
      status: 'QUEUED',
      youtubeId: 'abc123DEF_-',
      job: { status: 'PENDING', position: 1 },
    });

    const jobs = await prisma.job.findMany({ where: { songId: song.id } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.sourcePath).toBeNull();
  });

  it('puts each new job at the end of the queue', async () => {
    const first = (await importVideo(VALID_BODY)).json().song;
    const second = (await importVideo({ ...VALID_BODY, youtubeId: 'zzzzzzzzzzz' })).json().song;
    expect([first.job.position, second.job.position]).toEqual([1, 2]);
  });

  it('continues numbering after running jobs but not after finished ones', async () => {
    const first = (await importVideo(VALID_BODY)).json().song;
    await prisma.job.update({ where: { id: first.job.id }, data: { status: 'DONE', position: 9 } });

    const second = (await importVideo({ ...VALID_BODY, youtubeId: 'zzzzzzzzzzz' })).json().song;

    expect(second.job.position).toBe(1);
  });

  it('returns the existing song instead of importing the same video twice', async () => {
    const first = (await importVideo(VALID_BODY)).json();
    const second = await importVideo({ ...VALID_BODY, title: 'Outro título' });

    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      alreadyExists: true,
      song: { id: first.song.id, title: 'Evidências' },
    });
    expect(await prisma.song.count()).toBe(1);
    expect(await prisma.job.count()).toBe(1);
  });

  it('handles two simultaneous imports of the same video', async () => {
    const [a, b] = await Promise.all([importVideo(VALID_BODY), importVideo(VALID_BODY)]);

    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(await prisma.song.count()).toBe(1);
    expect(await prisma.job.count()).toBe(1);
  });

  it('records who added the song', async () => {
    const profile = await prisma.profile.create({ data: { name: 'Ana', avatar: 'lion' } });
    const song = (await importVideo({ ...VALID_BODY, profileId: profile.id })).json().song;
    const stored = await prisma.song.findUniqueOrThrow({ where: { id: song.id } });
    expect(stored.addedById).toBe(profile.id);
  });

  it('rejects an unknown profile', async () => {
    const response = await importVideo({ ...VALID_BODY, profileId: 'nope' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('PROFILE_NOT_FOUND');
    expect(await prisma.song.count()).toBe(0);
  });

  it('rejects videos longer than 12 minutes', async () => {
    const response = await importVideo({ ...VALID_BODY, durationSec: 721 });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VIDEO_TOO_LONG');
    expect((await importVideo({ ...VALID_BODY, durationSec: 720 })).statusCode).toBe(201);
  });

  it('validates the body', async () => {
    const invalidBodies = [
      { ...VALID_BODY, youtubeId: 'short' },
      { ...VALID_BODY, youtubeId: 'has space!!' },
      { ...VALID_BODY, title: '   ' },
      { ...VALID_BODY, artist: '' },
      { ...VALID_BODY, title: 'x'.repeat(201) },
    ];
    for (const body of invalidBodies) {
      const response = await importVideo(body);
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    }
    expect(await prisma.song.count()).toBe(0);
  });

  it('notifies the clients about the new song and job', async () => {
    await importVideo(VALID_BODY);
    const events = vi.mocked(emitToAll).mock.calls.map(([event]) => event);
    expect(events).toEqual(['song:updated', 'job:updated']);
  });

  it('is available to phones that have the access code and records who asked for it', async () => {
    await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });
    const guest = await prisma.profile.create({ data: { name: 'Carla', avatar: 'frog', isGuest: true } });

    const response = await app.inject({
      method: 'POST',
      url: '/api/youtube/import',
      payload: { ...VALID_BODY, profileId: guest.id },
      remoteAddress: '192.168.0.50',
      headers: { 'x-access-code': 'ABC234' },
    });

    expect(response.statusCode).toBe(201);
    const stored = await prisma.song.findUniqueOrThrow({ where: { id: response.json().song.id } });
    expect(stored.addedById).toBe(guest.id);
  });
});
