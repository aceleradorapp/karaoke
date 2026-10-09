import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createJobFixture,
  createSong,
  fileExists,
  listDirectory,
  resetStorage,
} from '../../../test/fixtures.js';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { emitToAll } from '../../realtime.js';
import { songDir, storagePaths } from '../../services/storage.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn() }));

const MINUTE_MS = 60_000;

describe('song routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await resetDatabase();
    await resetStorage();
    vi.mocked(emitToAll).mockClear();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const get = (url: string) => app.inject({ method: 'GET', url });
  const titles = async (query = '') =>
    (await get(`/api/songs${query}`)).json().items.map((item: { title: string }) => item.title);

  async function seedLibrary() {
    const base = Date.now();
    await createSong({
      title: 'Evidências',
      artist: 'Chitãozinho & Xororó',
      createdAt: new Date(base - 3 * MINUTE_MS),
      playCount: 5,
    });
    await createSong({
      title: 'Garçom',
      artist: 'Reginaldo Rossi',
      createdAt: new Date(base - 2 * MINUTE_MS),
      playCount: 9,
    });
    await createSong({
      title: 'Ai Se Eu Te Pego',
      artist: 'Michel Teló',
      createdAt: new Date(base - MINUTE_MS),
      playCount: 0,
    });
  }

  describe('listing', () => {
    it('lists the newest songs first with the media urls ready to use', async () => {
      await seedLibrary();
      await createSong({ title: 'Com capa', artist: 'X', hasCover: true, lyricsSource: 'LRCLIB' });

      const items = (await get('/api/songs')).json().items;

      expect(items[0]).toMatchObject({
        title: 'Com capa',
        status: 'READY',
        coverUrl: expect.stringMatching(/^\/media\/.+\/capa\.jpg\?v=\d+$/),
        instrumentalUrl: expect.stringMatching(/instrumental\.mp3$/),
        vocalsUrl: expect.stringMatching(/voz\.mp3$/),
        lyricsUrl: expect.stringMatching(/letra\.json/),
      });
      expect(items.map((item: { title: string }) => item.title).slice(1)).toEqual([
        'Ai Se Eu Te Pego',
        'Garçom',
        'Evidências',
      ]);
    });

    it('searches title and artist, ignoring case and accents', async () => {
      await seedLibrary();

      expect(await titles('?q=evidencias')).toEqual(['Evidências']);
      expect(await titles('?q=GARCOM')).toEqual(['Garçom']);
      expect(await titles('?q=rossi')).toEqual(['Garçom']);
      expect(await titles('?q=chitaozinho')).toEqual(['Evidências']);
    });

    it('requires every word of the search to match', async () => {
      await seedLibrary();

      expect(await titles('?q=evid%20xororo')).toEqual(['Evidências']);
      expect(await titles('?q=evid%20rossi')).toEqual([]);
      expect(await titles('?q=nada')).toEqual([]);
    });

    it('filters by status and by artist', async () => {
      await seedLibrary();
      await createSong({ title: 'Quebrada', artist: 'Reginaldo Rossi', status: 'ERROR' });

      expect(await titles('?status=ERROR')).toEqual(['Quebrada']);
      expect((await titles('?artist=reginaldo%20rossi')).sort()).toEqual(['Garçom', 'Quebrada']);
    });

    it('sorts by title, artist and popularity', async () => {
      await seedLibrary();

      expect(await titles('?sort=title')).toEqual(['Ai Se Eu Te Pego', 'Evidências', 'Garçom']);
      expect(await titles('?sort=artist')).toEqual(['Evidências', 'Ai Se Eu Te Pego', 'Garçom']);
      expect(await titles('?sort=popular')).toEqual(['Garçom', 'Evidências', 'Ai Se Eu Te Pego']);
    });

    it('pages through the library without repeating or skipping songs', async () => {
      for (let index = 1; index <= 5; index++) {
        await createSong({ title: `Song ${index}`, createdAt: new Date(Date.now() - index * MINUTE_MS) });
      }

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const query: string = `?limit=2${cursor ? `&cursor=${cursor}` : ''}`;
        const page: { items: Array<{ title: string }>; nextCursor: string | null } = (
          await get(`/api/songs${query}`)
        ).json();
        seen.push(...page.items.map((item) => item.title));
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor);

      expect(pages).toBe(3);
      expect(seen).toEqual(['Song 1', 'Song 2', 'Song 3', 'Song 4', 'Song 5']);
    });

    it('has no next page when everything fits', async () => {
      await seedLibrary();
      expect((await get('/api/songs?limit=3')).json().nextCursor).toBeNull();
    });

    it('marks the favorites of the informed profile', async () => {
      await seedLibrary();
      const profile = await prisma.profile.create({ data: { name: 'Ana', avatar: 'lion' } });
      const garcom = await prisma.song.findFirstOrThrow({ where: { title: 'Garçom' } });
      await prisma.favorite.create({ data: { profileId: profile.id, songId: garcom.id } });

      const withProfile = (await get(`/api/songs?sort=title&profileId=${profile.id}`)).json().items;
      const withoutProfile = (await get('/api/songs')).json().items;

      expect(withProfile.map((item: { isFavorite: boolean }) => item.isFavorite)).toEqual([
        false,
        false,
        true,
      ]);
      expect(withoutProfile[0]).not.toHaveProperty('isFavorite');
    });

    it('shows the job of songs that are not ready, but not of the ready ones', async () => {
      await createSong({ title: 'Pronta' });
      const { job } = await createJobFixture({
        title: 'Processando',
        status: 'RUNNING',
        songStatus: 'PROCESSING',
      });
      await prisma.job.update({ where: { id: job.id }, data: { progress: 42, step: 'SEPARATE' } });

      const items = (await get('/api/songs')).json().items;
      const processing = items.find((item: { title: string }) => item.title === 'Processando');
      const ready = items.find((item: { title: string }) => item.title === 'Pronta');

      expect(processing.job).toMatchObject({ status: 'RUNNING', progress: 42, step: 'SEPARATE' });
      expect(ready).not.toHaveProperty('job');
    });

    it('validates the query', async () => {
      for (const query of [
        '?limit=0',
        '?limit=101',
        '?sort=random',
        '?status=NOPE',
        `?q=${'x'.repeat(101)}`,
      ]) {
        const response = await get(`/api/songs${query}`);
        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('detail', () => {
    it('returns one song and whether it is a favorite of the profile', async () => {
      const song = await createSong({ title: 'Evidências' });
      const profile = await prisma.profile.create({ data: { name: 'Ana', avatar: 'lion' } });
      await prisma.favorite.create({ data: { profileId: profile.id, songId: song.id } });

      const response = await get(`/api/songs/${song.id}?profileId=${profile.id}`);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ id: song.id, title: 'Evidências', isFavorite: true });
    });

    it('answers 404 for an unknown song', async () => {
      const response = await get('/api/songs/unknown');
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('SONG_NOT_FOUND');
    });
  });

  describe('editing', () => {
    const patch = (id: string, payload: Record<string, unknown>) =>
      app.inject({ method: 'PATCH', url: `/api/songs/${id}`, payload });

    it('updates only what was sent and tells the clients', async () => {
      const song = await createSong({ title: 'Old', artist: 'Keep' });

      const response = await patch(song.id, { title: '  New  ', lyricsOffsetMs: -300 });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ title: 'New', artist: 'Keep', lyricsOffsetMs: -300 });
      expect(vi.mocked(emitToAll).mock.calls.map(([event]) => event)).toEqual(['song:updated']);
    });

    it('starts every song with the normal fill time and saves a new one', async () => {
      const song = await createSong();
      expect((await get(`/api/songs/${song.id}`)).json().fillPercent).toBe(100);

      const response = await patch(song.id, { fillPercent: 65 });

      expect(response.statusCode).toBe(200);
      expect(response.json().fillPercent).toBe(65);
      expect((await prisma.song.findUniqueOrThrow({ where: { id: song.id } })).fillPercent).toBe(65);
    });

    it('rejects invalid changes', async () => {
      const song = await createSong();

      for (const payload of [
        {},
        { title: '   ' },
        { artist: '' },
        { lyricsOffsetMs: 60001 },
        { lyricsOffsetMs: 1.5 },
        { fillPercent: 19 },
        { fillPercent: 151 },
        { fillPercent: 80.5 },
      ]) {
        expect((await patch(song.id, payload)).statusCode).toBe(400);
      }
    });

    it('answers 404 for an unknown song', async () => {
      expect((await patch('unknown', { title: 'X' })).statusCode).toBe(404);
    });
  });

  describe('key of each singer', () => {
    const keyOf = (songId: string, profileId: string) =>
      app.inject({ method: 'GET', url: `/api/songs/${songId}/key?profileId=${profileId}` });
    const saveKey = (songId: string, payload: object) =>
      app.inject({ method: 'PUT', url: `/api/songs/${songId}/key`, payload });

    it('keeps a key for each person in each song', async () => {
      const song = await createSong();
      const other = await createSong({ title: 'Outra' });
      const ana = await prisma.profile.create({ data: { name: 'Ana', avatar: 'lion' } });
      const bia = await prisma.profile.create({ data: { name: 'Bia', avatar: 'cat', isGuest: true } });

      expect((await keyOf(song.id, ana.id)).json()).toEqual({ keyShift: 0 });
      expect((await saveKey(song.id, { profileId: ana.id, keyShift: -2 })).json()).toEqual({ keyShift: -2 });
      await saveKey(song.id, { profileId: bia.id, keyShift: 3 });

      expect((await keyOf(song.id, ana.id)).json()).toEqual({ keyShift: -2 });
      expect((await keyOf(song.id, bia.id)).json()).toEqual({ keyShift: 3 });
      expect((await keyOf(other.id, ana.id)).json()).toEqual({ keyShift: 0 });
    });

    it('forgets the key when the person goes back to the original', async () => {
      const song = await createSong();
      const ana = await prisma.profile.create({ data: { name: 'Ana', avatar: 'lion' } });
      await saveKey(song.id, { profileId: ana.id, keyShift: 4 });

      await saveKey(song.id, { profileId: ana.id, keyShift: 0 });

      expect(await prisma.singerSongKey.count()).toBe(0);
      expect((await keyOf(song.id, ana.id)).json()).toEqual({ keyShift: 0 });
    });

    it('goes away with the person or the song', async () => {
      const song = await createSong();
      const ana = await prisma.profile.create({ data: { name: 'Ana', avatar: 'lion' } });
      await saveKey(song.id, { profileId: ana.id, keyShift: 2 });

      await prisma.profile.delete({ where: { id: ana.id } });

      expect(await prisma.singerSongKey.count()).toBe(0);
    });

    it('rejects keys out of range and unknown people or songs', async () => {
      const song = await createSong();
      const ana = await prisma.profile.create({ data: { name: 'Ana', avatar: 'lion' } });
      expect((await saveKey(song.id, { profileId: ana.id, keyShift: 7 })).statusCode).toBe(400);
      expect((await saveKey(song.id, { profileId: ana.id, keyShift: 1.5 })).statusCode).toBe(400);
      expect((await saveKey(song.id, { profileId: 'nao-existe', keyShift: 1 })).statusCode).toBe(404);
      expect((await saveKey('nao-existe', { profileId: ana.id, keyShift: 1 })).statusCode).toBe(404);
    });
  });

  describe('deleting several at once', () => {
    const removeMany = (ids: string[]) =>
      app.inject({ method: 'POST', url: '/api/songs/delete-many', payload: { ids } });

    it('deletes the chosen songs and their files, skipping the one being processed', async () => {
      const first = await createSong({ title: 'Primeira' });
      const second = await createSong({ title: 'Segunda' });
      const { song: running } = await createJobFixture({ title: 'Rodando', status: 'RUNNING', songStatus: 'PROCESSING' });
      await createSong({ title: 'Fica' });
      await fs.mkdir(songDir(first.id), { recursive: true });

      const response = await removeMany([first.id, second.id, running.id, 'nao-existe', first.id]);

      expect(response.statusCode).toBe(200);
      expect(response.json().deleted).toEqual([first.id, second.id]);
      expect(response.json().skipped).toEqual([
        { id: running.id, title: 'Rodando', reason: 'Cancele o processamento antes de excluir a música' },
        { id: 'nao-existe', title: null, reason: 'Música não encontrada' },
      ]);
      expect((await prisma.song.findMany({ orderBy: { title: 'asc' } })).map((song) => song.title)).toEqual([
        'Fica',
        'Rodando',
      ]);
      expect(await fileExists(songDir(first.id))).toBe(false);
    });

    it('needs at least one song', async () => {
      expect((await removeMany([])).statusCode).toBe(400);
    });
  });

  describe('deleting', () => {
    const remove = (id: string) => app.inject({ method: 'DELETE', url: `/api/songs/${id}` });

    it('removes the song, its files and everything that points to it', async () => {
      const song = await createSong();
      const profile = await prisma.profile.create({ data: { name: 'Ana', avatar: 'lion' } });
      await prisma.favorite.create({ data: { profileId: profile.id, songId: song.id } });
      await prisma.job.create({ data: { songId: song.id, position: 1, status: 'DONE' } });
      await fs.mkdir(songDir(song.id), { recursive: true });
      await fs.writeFile(path.join(songDir(song.id), 'instrumental.mp3'), 'audio');

      const response = await remove(song.id);

      expect(response.statusCode).toBe(204);
      expect(await prisma.song.count()).toBe(0);
      expect(await prisma.favorite.count()).toBe(0);
      expect(await prisma.job.count()).toBe(0);
      expect(await fileExists(songDir(song.id))).toBe(false);
      expect(vi.mocked(emitToAll)).toHaveBeenCalledWith('song:deleted', { id: song.id });
    });

    it('refuses to delete a song that is being processed', async () => {
      const { song } = await createJobFixture({ status: 'RUNNING', songStatus: 'PROCESSING' });

      const response = await remove(song.id);

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('SONG_BEING_PROCESSED');
      expect(await prisma.song.count()).toBe(1);
    });

    it('moves the original of a song that was still waiting out of the upload folder', async () => {
      const { song, sourcePath } = await createJobFixture({ withOriginFile: true });

      await remove(song.id);

      expect(await fileExists(sourcePath as string)).toBe(false);
      expect(await listDirectory(storagePaths.uploadDir)).toEqual([]);
      expect(await listDirectory(storagePaths.errorDir)).toHaveLength(1);
    });

    it('answers 404 for an unknown song', async () => {
      expect((await remove('unknown')).statusCode).toBe(404);
    });
  });

  describe('access from phones', () => {
    beforeEach(async () => {
      await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });
    });

    const asPhone = (method: 'GET' | 'PATCH' | 'DELETE', url: string) =>
      app.inject({ method, url, remoteAddress: '192.168.0.50', headers: { 'x-access-code': 'ABC234' } });

    it('can search the library but cannot read details, edit or delete', async () => {
      const song = await createSong();

      expect((await asPhone('GET', '/api/songs?q=song')).statusCode).toBe(200);
      expect((await asPhone('GET', `/api/songs/${song.id}`)).statusCode).toBe(401);
      expect((await asPhone('PATCH', `/api/songs/${song.id}`)).statusCode).toBe(401);
      expect((await asPhone('DELETE', `/api/songs/${song.id}`)).statusCode).toBe(401);
      expect(await prisma.song.count()).toBe(1);
    });
  });
});
