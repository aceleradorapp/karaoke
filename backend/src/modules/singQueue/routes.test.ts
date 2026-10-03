import type { FastifyInstance } from 'fastify';
import type { SongStatus } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { pickNext } from './service.js';
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

    it('answers 404 for an unknown profile or song', async () => {
      const ana = await createProfile('Ana');
      const song = await createSong('Evidências');

      expect((await request('nope', song.id)).json().error.code).toBe('PROFILE_NOT_FOUND');
      expect((await request(ana.id, 'nope')).json().error.code).toBe('SONG_NOT_FOUND');
    });
  });

  describe('limits', () => {
    beforeEach(async () => {
      await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });
    });

    const setSetting = (key: string, value: unknown) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: value as never },
        create: { key, value: value as never },
      });

    async function fourSongsFor(name: string) {
      const person = await createProfile(name);
      const songs = await Promise.all(['A', 'B', 'C', 'D'].map((title) => createSong(`${title}-${name}`)));
      return { person, songs };
    }

    it('limits a person to 3 waiting requests from the phone by default', async () => {
      const { person, songs } = await fourSongsFor('Ana');
      for (const song of songs.slice(0, 3)) await request(person.id, song.id, PHONE);

      const fourth = await request(person.id, songs[3]!.id, PHONE);

      expect(fourth.statusCode).toBe(409);
      expect(fourth.json().error).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
      expect(fourth.json().error.message).toContain('3 músicas');
    });

    it('follows the limit chosen in the settings', async () => {
      await setSetting('queue.maxRequestsPerPerson', 1);
      const { person, songs } = await fourSongsFor('Ana');
      await request(person.id, songs[0]!.id, PHONE);

      const second = await request(person.id, songs[1]!.id, PHONE);

      expect(second.statusCode).toBe(409);
      expect(second.json().error.message).toContain('1 música na fila');
    });

    it('has no limit when it is set to zero', async () => {
      await setSetting('queue.maxRequestsPerPerson', 0);
      const { person, songs } = await fourSongsFor('Ana');

      for (const song of songs) expect((await request(person.id, song.id, PHONE)).statusCode).toBe(201);
    });

    it('lets the TV go beyond the limit, unless the settings say otherwise', async () => {
      const { person, songs } = await fourSongsFor('Ana');
      for (const song of songs) expect((await request(person.id, song.id)).statusCode).toBe(201);

      await setSetting('queue.stageBypassesLimit', false);
      const other = await fourSongsFor('Bia');
      for (const song of other.songs.slice(0, 3)) await request(other.person.id, song.id);
      expect((await request(other.person.id, other.songs[3]!.id)).statusCode).toBe(409);
    });
  });

  describe('who sings next', () => {
    const setSetting = (key: string, value: unknown) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: value as never },
        create: { key, value: value as never },
      });
    const queueResponse = async () => (await app.inject({ method: 'GET', url: '/api/sing-queue' })).json();

    it('is the first request whose song is ready', async () => {
      const ana = await createProfile('Ana');
      const bia = await createProfile('Bia');
      await request(ana.id, (await createSong('Nova', 'PROCESSING')).id);
      const { id } = (await request(bia.id, (await createSong('Pronta')).id)).json();

      expect((await queueResponse()).nextId).toBe(id);
    });

    it('is empty when no song is ready', async () => {
      const ana = await createProfile('Ana');
      await request(ana.id, (await createSong('Nova', 'PROCESSING')).id);

      expect((await queueResponse()).nextId).toBeNull();
    });

    it('is drawn by the server in shuffle mode and stays the same until it is sung', async () => {
      const people = await Promise.all(['Ana', 'Bia', 'Carla', 'Duda'].map((name) => createProfile(name)));
      for (const person of people) await request(person.id, (await createSong(`Música ${person.name}`)).id);
      await setSetting('queue.shuffle', true);

      const first = (await queueResponse()).nextId;
      const again = (await queueResponse()).nextId;

      expect(first).not.toBeNull();
      expect(again).toBe(first);
    });

    it('is announced again when the shuffle setting changes', async () => {
      const ana = await createProfile('Ana');
      await request(ana.id, (await createSong('Pronta')).id);
      vi.mocked(emitToAll).mockClear();

      await app.inject({ method: 'PATCH', url: '/api/settings', payload: { 'queue.shuffle': true } });

      const events = vi.mocked(emitToAll).mock.calls.filter(([event]) => event === 'singQueue:changed');
      expect(events).toHaveLength(1);
      expect(events[0]?.[1]).toHaveProperty('nextId');
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

describe('pickNext', () => {
  const item = (id: string, profileId: string, status = 'READY') =>
    ({ id, profile: { id: profileId }, song: { status } }) as never;
  const queue = [item('r1', 'ana', 'PROCESSING'), item('r2', 'ana'), item('r3', 'bia'), item('r4', 'carla')];

  it('takes the first ready request in order when not shuffled', () => {
    expect(pickNext(queue, false, 'r4', 'ana')).toBe('r2');
  });

  it('keeps the previous draw while it can still be sung', () => {
    expect(pickNext(queue, true, 'r4', null, () => 0)).toBe('r4');
  });

  it('draws among ready requests, avoiding whoever sang last when possible', () => {
    expect(pickNext(queue, true, null, 'ana', () => 0)).toBe('r3');
    expect(pickNext(queue, true, null, 'ana', () => 0.99)).toBe('r4');
    expect(pickNext([item('r2', 'ana')], true, null, 'ana', () => 0)).toBe('r2');
  });

  it('draws again when the previous one was sung', () => {
    expect(pickNext(queue, true, 'gone', 'bia', () => 0)).toBe('r2');
  });
});
