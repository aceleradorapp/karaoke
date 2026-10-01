import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSong } from '../../../test/fixtures.js';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';

describe('performance routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(resetDatabase);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const start = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/api/performances', payload });
  const finish = (id: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: `/api/performances/${id}/finish`, payload });
  const playCountOf = async (songId: string) =>
    (await prisma.song.findUniqueOrThrow({ where: { id: songId } })).playCount;

  async function setup() {
    const profile = await prisma.profile.create({ data: { name: 'Ana', avatar: 'lion' } });
    const song = await createSong({ title: 'Evidências' });
    return { profile, song };
  }

  describe('starting', () => {
    it('records the performance and counts one more play of the song', async () => {
      const { profile, song } = await setup();

      const response = await start({ profileId: profile.id, songId: song.id });

      expect(response.statusCode).toBe(201);
      const stored = await prisma.performance.findUniqueOrThrow({ where: { id: response.json().id } });
      expect(stored).toMatchObject({
        profileId: profile.id,
        songId: song.id,
        completed: false,
        finishedAt: null,
      });
      expect(await playCountOf(song.id)).toBe(1);
    });

    it('counts every time the song is sung', async () => {
      const { profile, song } = await setup();

      await start({ profileId: profile.id, songId: song.id });
      await start({ profileId: profile.id, songId: song.id });

      expect(await playCountOf(song.id)).toBe(2);
      expect(await prisma.performance.count()).toBe(2);
    });

    it('answers 404 for an unknown profile or song', async () => {
      const { profile, song } = await setup();

      const unknownProfile = await start({ profileId: 'nope', songId: song.id });
      const unknownSong = await start({ profileId: profile.id, songId: 'nope' });

      expect(unknownProfile.json().error.code).toBe('PROFILE_NOT_FOUND');
      expect(unknownSong.json().error.code).toBe('SONG_NOT_FOUND');
      expect(await prisma.performance.count()).toBe(0);
    });

    it('does not let anyone sing a song that is not ready', async () => {
      const profile = await prisma.profile.create({ data: { name: 'Ana', avatar: 'lion' } });
      const queued = await createSong({ status: 'QUEUED' });

      const response = await start({ profileId: profile.id, songId: queued.id });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('SONG_NOT_READY');
      expect(await playCountOf(queued.id)).toBe(0);
      expect(await prisma.performance.count()).toBe(0);
    });

    it('validates the body', async () => {
      for (const payload of [{}, { profileId: 'a' }, { songId: 'b' }, { profileId: '', songId: 'b' }]) {
        expect((await start(payload)).statusCode).toBe(400);
      }
    });
  });

  describe('finishing', () => {
    async function started() {
      const { profile, song } = await setup();
      const { id } = (await start({ profileId: profile.id, songId: song.id })).json();
      return id as string;
    }

    it('stores how it ended', async () => {
      const id = await started();

      const response = await finish(id, { completed: true, voiceGuideUsed: true, pitchScore: 87 });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ finalScore: null });
      const stored = await prisma.performance.findUniqueOrThrow({ where: { id } });
      expect(stored).toMatchObject({ completed: true, voiceGuideUsed: true, pitchScore: 87 });
      expect(stored.finishedAt).not.toBeNull();
    });

    it('accepts a performance without a pitch score and one that was left halfway', async () => {
      const id = await started();

      await finish(id, { completed: false, voiceGuideUsed: false, pitchScore: null });

      expect(await prisma.performance.findUniqueOrThrow({ where: { id } })).toMatchObject({
        completed: false,
        voiceGuideUsed: false,
        pitchScore: null,
      });
    });

    it('cannot be finished twice', async () => {
      const id = await started();
      await finish(id, { completed: true, voiceGuideUsed: false, pitchScore: null });

      const again = await finish(id, { completed: false, voiceGuideUsed: true, pitchScore: 10 });

      expect(again.statusCode).toBe(409);
      expect(again.json().error.code).toBe('PERFORMANCE_ALREADY_FINISHED');
      expect((await prisma.performance.findUniqueOrThrow({ where: { id } })).completed).toBe(true);
    });

    it('answers 404 for an unknown performance', async () => {
      const response = await finish('nope', { completed: true, voiceGuideUsed: false, pitchScore: null });
      expect(response.statusCode).toBe(404);
    });

    it('validates the body', async () => {
      const id = await started();
      const invalidBodies = [
        {},
        { completed: true, voiceGuideUsed: false },
        { completed: true, voiceGuideUsed: false, pitchScore: 101 },
        { completed: true, voiceGuideUsed: false, pitchScore: -1 },
        { completed: true, voiceGuideUsed: false, pitchScore: 50.5 },
        { completed: 'yes', voiceGuideUsed: false, pitchScore: null },
      ];
      for (const body of invalidBodies) expect((await finish(id, body)).statusCode).toBe(400);
      expect((await prisma.performance.findUniqueOrThrow({ where: { id } })).finishedAt).toBeNull();
    });
  });

  describe('history', () => {
    const history = (profileId: string, query = '') =>
      app.inject({ method: 'GET', url: `/api/profiles/${profileId}/history${query}` });

    async function sing(profileId: string, songId: string, startedAt: string, completed = true) {
      return prisma.performance.create({
        data: {
          profileId,
          songId,
          startedAt: new Date(startedAt),
          completed,
          finishedAt: new Date(startedAt),
        },
      });
    }

    it('lists the profile performances, newest first, with the song', async () => {
      const { profile, song } = await setup();
      const other = await createSong({ title: 'Outra' });
      await sing(profile.id, song.id, '2026-01-01T10:00:00Z');
      await sing(profile.id, other.id, '2026-02-01T10:00:00Z', false);

      const response = await history(profile.id);

      expect(response.statusCode).toBe(200);
      const { items, nextCursor } = response.json();
      expect(nextCursor).toBeNull();
      expect(items.map((item: { song: { title: string } }) => item.song.title)).toEqual([
        'Outra',
        'Evidências',
      ]);
      expect(items[0]).toMatchObject({
        completed: false,
        finalScore: null,
        pitchScore: null,
        audienceScore: null,
      });
      expect(items[0].startedAt).toBe('2026-02-01T10:00:00.000Z');
    });

    it('shows only the performances of that profile', async () => {
      const { profile, song } = await setup();
      const bia = await prisma.profile.create({ data: { name: 'Bia', avatar: 'cat' } });
      await sing(bia.id, song.id, '2026-01-01T10:00:00Z');

      expect((await history(profile.id)).json().items).toEqual([]);
    });

    it('marks the songs the profile has favorited', async () => {
      const { profile, song } = await setup();
      await sing(profile.id, song.id, '2026-01-01T10:00:00Z');
      await prisma.favorite.create({ data: { profileId: profile.id, songId: song.id } });

      expect((await history(profile.id)).json().items[0].song.isFavorite).toBe(true);
    });

    it('pages with a cursor', async () => {
      const { profile, song } = await setup();
      for (let day = 1; day <= 5; day++) await sing(profile.id, song.id, `2026-01-0${day}T10:00:00Z`);

      const first = (await history(profile.id, '?limit=2')).json();
      const second = (await history(profile.id, `?limit=2&cursor=${first.nextCursor}`)).json();
      const third = (await history(profile.id, `?limit=2&cursor=${second.nextCursor}`)).json();

      const days = [...first.items, ...second.items, ...third.items].map((item: { startedAt: string }) =>
        item.startedAt.slice(8, 10),
      );
      expect(days).toEqual(['05', '04', '03', '02', '01']);
      expect(third.nextCursor).toBeNull();
    });

    it('rejects an absurd page size and answers 404 for a missing profile', async () => {
      const { profile } = await setup();
      expect((await history(profile.id, '?limit=0')).statusCode).toBe(400);
      expect((await history(profile.id, '?limit=101')).statusCode).toBe(400);
      expect((await history('nobody')).statusCode).toBe(404);
    });
  });

  it('is not available to phones', async () => {
    await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });
    const { profile, song } = await setup();

    const response = await app.inject({
      method: 'POST',
      url: '/api/performances',
      payload: { profileId: profile.id, songId: song.id },
      remoteAddress: '192.168.0.50',
      headers: { 'x-access-code': 'ABC234' },
    });

    expect(response.statusCode).toBe(401);
  });
});
