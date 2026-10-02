import type { FastifyInstance } from 'fastify';
import type { SongStatus } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { emitToAll } from '../../realtime.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn(), disconnectRoom: vi.fn() }));

const PHONE = { remoteAddress: '192.168.0.50', headers: { 'x-access-code': 'ABC234' } };

interface QueueItem {
  id: string;
  position: number;
  profile: { id: string; name: string };
  song: { id: string; title: string; status: string };
}

describe('sing queue routes', () => {
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

  const createProfile = (name: string, isGuest = true) =>
    prisma.profile.create({ data: { name, avatar: 'frog', isGuest } });

  let songCounter = 0;
  const createSong = (title: string, status: SongStatus = 'READY') =>
    prisma.song.create({
      data: { title, artist: 'Artista', source: 'YOUTUBE', youtubeId: `yt${++songCounter}`, status },
    });

  const request = (profileId: string, songId: string, extra: object = {}) =>
    app.inject({ method: 'POST', url: '/api/sing-queue', payload: { profileId, songId }, ...extra });

  const queue = async (): Promise<QueueItem[]> =>
    (await app.inject({ method: 'GET', url: '/api/sing-queue' })).json().items;

  const lastQueueEvent = (): QueueItem[] | undefined => {
    const calls = vi.mocked(emitToAll).mock.calls.filter(([event]) => event === 'singQueue:changed');
    return (calls.at(-1)?.[1] as { items: QueueItem[] } | undefined)?.items;
  };

  describe('asking to sing', () => {
    it('puts the request at the end of the queue with the singer and the song', async () => {
      const ana = await createProfile('Ana');
      const carla = await createProfile('Carla');
      const evidencias = await createSong('Evidências');
      const azul = await createSong('Azul da Cor do Mar');

      const first = await request(ana.id, evidencias.id);
      await request(carla.id, azul.id);

      expect(first.statusCode).toBe(201);
      expect(first.json()).toMatchObject({
        position: 1,
        profile: { name: 'Ana' },
        song: { title: 'Evidências' },
      });
      expect((await queue()).map((item) => [item.position, item.profile.name, item.song.title])).toEqual([
        [1, 'Ana', 'Evidências'],
        [2, 'Carla', 'Azul da Cor do Mar'],
      ]);
    });

    it('tells everyone the whole queue', async () => {
      const ana = await createProfile('Ana');
      const song = await createSong('Evidências');

      await request(ana.id, song.id);

      expect(lastQueueEvent()?.map((item) => item.song.title)).toEqual(['Evidências']);
    });

    it('accepts a song that is still being prepared', async () => {
      const ana = await createProfile('Ana');
      const song = await createSong('Nova', 'PROCESSING');

      const response = await request(ana.id, song.id);

      expect(response.statusCode).toBe(201);
      expect(response.json().song.status).toBe('PROCESSING');
    });

    it('refuses a song that failed to process', async () => {
      const ana = await createProfile('Ana');
      const song = await createSong('Quebrada', 'ERROR');

      const response = await request(ana.id, song.id);

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('SONG_UNAVAILABLE');
    });

    it('refuses the same song twice for the same person, but not for someone else', async () => {
      const ana = await createProfile('Ana');
      const carla = await createProfile('Carla');
      const song = await createSong('Evidências');
      await request(ana.id, song.id);

      const again = await request(ana.id, song.id);
      const other = await request(carla.id, song.id);

      expect(again.statusCode).toBe(409);
      expect(again.json().error.code).toBe('ALREADY_REQUESTED');
      expect(other.statusCode).toBe(201);
    });

    it('limits each person to 3 waiting requests', async () => {
      const ana = await createProfile('Ana');
      const songs = await Promise.all(['A', 'B', 'C', 'D'].map((title) => createSong(title)));
      for (const song of songs.slice(0, 3)) await request(ana.id, song.id);

      const fourth = await request(ana.id, songs[3]!.id);

      expect(fourth.statusCode).toBe(409);
      expect(fourth.json().error).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
      expect(fourth.json().error.message).toContain('3 músicas');
    });

    it('answers 404 for an unknown profile or song', async () => {
      const ana = await createProfile('Ana');
      const song = await createSong('Evidências');

      expect((await request('nope', song.id)).json().error.code).toBe('PROFILE_NOT_FOUND');
      expect((await request(ana.id, 'nope')).json().error.code).toBe('SONG_NOT_FOUND');
    });
  });

  describe('on the stage', () => {
    it('reorders, ignoring unknown ids and keeping the missing ones at the end', async () => {
      const ana = await createProfile('Ana');
      const [a, b, c] = await Promise.all(['A', 'B', 'C'].map((title) => createSong(title)));
      const ids = [];
      for (const song of [a!, b!, c!]) ids.push((await request(ana.id, song.id)).json().id);

      const response = await app.inject({
        method: 'PUT',
        url: '/api/sing-queue/order',
        payload: { ids: [ids[2], 'unknown', ids[0]] },
      });

      expect(response.statusCode).toBe(200);
      const titles = (items: QueueItem[]) => items.map((item) => `${item.position}${item.song.title}`);
      expect(titles(response.json().items)).toEqual(['1C', '2A', '3B']);
      expect(titles(await queue())).toEqual(['1C', '2A', '3B']);
      expect(titles(lastQueueEvent() ?? [])).toEqual(['1C', '2A', '3B']);
    });

    it('removes anyone’s request', async () => {
      const ana = await createProfile('Ana');
      const song = await createSong('Evidências');
      const { id } = (await request(ana.id, song.id)).json();

      const response = await app.inject({ method: 'DELETE', url: `/api/sing-queue/${id}` });

      expect(response.statusCode).toBe(204);
      expect(await queue()).toEqual([]);
      expect(lastQueueEvent()).toEqual([]);
    });

    it('answers 404 when the request is already gone', async () => {
      const response = await app.inject({ method: 'DELETE', url: '/api/sing-queue/nope' });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('SING_REQUEST_NOT_FOUND');
    });
  });

  describe('from a phone', () => {
    beforeEach(async () => {
      await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });
    });

    it('sees the queue and asks to sing', async () => {
      const carla = await createProfile('Carla');
      const song = await createSong('Evidências');

      const created = await request(carla.id, song.id, PHONE);
      const listed = await app.inject({ method: 'GET', url: '/api/sing-queue', ...PHONE });

      expect(created.statusCode).toBe(201);
      expect(listed.json().items).toHaveLength(1);
    });

    it('removes only its own requests', async () => {
      const ana = await createProfile('Ana');
      const carla = await createProfile('Carla');
      const song = await createSong('Evidências');
      const { id } = (await request(ana.id, song.id)).json();

      const asSomeoneElse = await app.inject({
        method: 'DELETE',
        url: `/api/sing-queue/${id}?profileId=${carla.id}`,
        ...PHONE,
      });
      const withoutSayingWho = await app.inject({ method: 'DELETE', url: `/api/sing-queue/${id}`, ...PHONE });
      const asTheOwner = await app.inject({
        method: 'DELETE',
        url: `/api/sing-queue/${id}?profileId=${ana.id}`,
        ...PHONE,
      });

      expect(asSomeoneElse.statusCode).toBe(403);
      expect(asSomeoneElse.json().error.code).toBe('NOT_YOUR_REQUEST');
      expect(withoutSayingWho.statusCode).toBe(403);
      expect(asTheOwner.statusCode).toBe(204);
    });

    it('cannot reorder the queue', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/sing-queue/order',
        payload: { ids: [] },
        ...PHONE,
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('leaving the queue', () => {
    it('leaves when the performance starts from the request, and the queue is announced', async () => {
      const ana = await createProfile('Ana');
      const song = await createSong('Evidências');
      const { id } = (await request(ana.id, song.id)).json();
      vi.mocked(emitToAll).mockClear();

      const started = await app.inject({
        method: 'POST',
        url: '/api/performances',
        payload: { profileId: ana.id, songId: song.id, requestId: id },
      });

      expect(started.statusCode).toBe(201);
      expect(await queue()).toEqual([]);
      expect(lastQueueEvent()).toEqual([]);
    });

    it('starts the performance even when the request was already removed', async () => {
      const ana = await createProfile('Ana');
      const song = await createSong('Evidências');

      const started = await app.inject({
        method: 'POST',
        url: '/api/performances',
        payload: { profileId: ana.id, songId: song.id, requestId: 'gone' },
      });

      expect(started.statusCode).toBe(201);
      expect(lastQueueEvent()).toBeUndefined();
    });

    it('leaves when the singer or the song is deleted', async () => {
      const ana = await createProfile('Ana');
      const carla = await createProfile('Carla');
      const evidencias = await createSong('Evidências');
      const azul = await createSong('Azul');
      await request(ana.id, evidencias.id);
      await request(carla.id, azul.id);

      await app.inject({ method: 'DELETE', url: `/api/profiles/${ana.id}` });
      expect(lastQueueEvent()?.map((item) => item.profile.name)).toEqual(['Carla']);

      await app.inject({ method: 'DELETE', url: `/api/songs/${azul.id}` });
      expect(lastQueueEvent()).toEqual([]);
      expect(await queue()).toEqual([]);
    });
  });
});
