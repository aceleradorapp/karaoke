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
