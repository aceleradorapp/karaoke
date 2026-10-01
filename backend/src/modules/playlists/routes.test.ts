import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSong } from '../../../test/fixtures.js';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';

describe('playlist routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(resetDatabase);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const list = (profileId: string, songId?: string) =>
    app.inject({
      method: 'GET',
      url: `/api/profiles/${profileId}/playlists${songId ? `?songId=${songId}` : ''}`,
    });
  const create = (profileId: string, name: unknown) =>
    app.inject({ method: 'POST', url: `/api/profiles/${profileId}/playlists`, payload: { name } });
  const detail = (id: string) => app.inject({ method: 'GET', url: `/api/playlists/${id}` });
  const rename = (id: string, name: unknown) =>
    app.inject({ method: 'PATCH', url: `/api/playlists/${id}`, payload: { name } });
  const remove = (id: string) => app.inject({ method: 'DELETE', url: `/api/playlists/${id}` });
  const addSong = (id: string, songId: string) =>
    app.inject({ method: 'POST', url: `/api/playlists/${id}/items`, payload: { songId } });
  const removeSong = (id: string, songId: string) =>
    app.inject({ method: 'DELETE', url: `/api/playlists/${id}/items/${songId}` });
  const reorder = (id: string, songIds: string[]) =>
    app.inject({ method: 'PATCH', url: `/api/playlists/${id}/items/reorder`, payload: { songIds } });

  const titlesOf = (response: { json: () => { items: Array<{ title: string }> } }) =>
    response.json().items.map((song) => song.title);

  async function setup() {
    const profile = await prisma.profile.create({ data: { name: 'Ana', avatar: 'lion' } });
    const playlist = (await create(profile.id, 'Sertanejo raiz')).json() as { id: string };
    const songs = [
      await createSong({ title: 'A', hasCover: true }),
      await createSong({ title: 'B' }),
      await createSong({ title: 'C', hasCover: true }),
    ];
    return { profile, playlist, songs };
  }

  describe('creating and listing', () => {
    it('creates an empty playlist for the profile', async () => {
      const profile = await prisma.profile.create({ data: { name: 'Ana', avatar: 'lion' } });

      const response = await create(profile.id, '  Festa de sábado  ');

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ name: 'Festa de sábado', count: 0, coverUrls: [] });
      expect(await prisma.playlist.count({ where: { profileId: profile.id } })).toBe(1);
    });

    it.each([[''], ['   '], ['a'.repeat(81)], [42]])('rejects the invalid name %j', async (name) => {
      const profile = await prisma.profile.create({ data: { name: 'Ana', avatar: 'lion' } });
      expect((await create(profile.id, name)).statusCode).toBe(400);
    });

    it('does not allow two playlists with the same name for one profile', async () => {
      const { profile } = await setup();

      const response = await create(profile.id, 'sertanejo RAIZ');

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('PLAYLIST_NAME_TAKEN');
    });

    it('allows the same name for different profiles', async () => {
      const { playlist } = await setup();
      const other = await prisma.profile.create({ data: { name: 'Bia', avatar: 'cat' } });

      expect((await create(other.id, 'Sertanejo raiz')).statusCode).toBe(201);
      expect(playlist.id).toBeTruthy();
    });

    it('answers 404 when the profile does not exist', async () => {
      expect((await create('nobody', 'X')).statusCode).toBe(404);
      expect((await list('nobody')).statusCode).toBe(404);
    });

    it('lists only the playlists of that profile, with count and up to four covers', async () => {
      const { profile, playlist, songs } = await setup();
      const extra = await createSong({ title: 'D', hasCover: true });
      for (const song of [...songs, extra]) await addSong(playlist.id, song.id);
      const other = await prisma.profile.create({ data: { name: 'Bia', avatar: 'cat' } });
      await create(other.id, 'De outra pessoa');

      const response = await list(profile.id);

      const [item, ...rest] = response.json().items;
      expect(rest).toEqual([]);
      expect(item).toMatchObject({ id: playlist.id, name: 'Sertanejo raiz', count: 4 });
      expect(item.coverUrls).toHaveLength(3);
      expect(item.coverUrls[0]).toMatch(new RegExp(`^/media/${songs[0]?.id}/capa\\.jpg\\?v=\\d+$`));
      expect(item).not.toHaveProperty('containsSong');
    });

    it('limits the covers to four', async () => {
      const { profile, playlist } = await setup();
      for (let index = 0; index < 6; index++) {
        await addSong(playlist.id, (await createSong({ title: `S${index}`, hasCover: true })).id);
      }

      expect((await list(profile.id)).json().items[0].coverUrls).toHaveLength(4);
    });

    it('marks which playlists already have the song when asked', async () => {
      const { profile, playlist, songs } = await setup();
      const second = (await create(profile.id, 'Festa')).json() as { id: string };
      await addSong(playlist.id, (songs[0] as { id: string }).id);

      const response = await list(profile.id, (songs[0] as { id: string }).id);

      const flags = Object.fromEntries(
        response
          .json()
          .items.map((item: { id: string; containsSong: boolean }) => [item.id, item.containsSong]),
      );
      expect(flags).toEqual({ [playlist.id]: true, [second.id]: false });
    });
  });

  describe('songs inside', () => {
    it('adds songs at the end and shows them in order', async () => {
      const { playlist, songs } = await setup();

      for (const song of songs) expect((await addSong(playlist.id, song.id)).statusCode).toBe(204);

      expect(titlesOf(await detail(playlist.id))).toEqual(['A', 'B', 'C']);
    });

    it('ignores a song that is already there', async () => {
      const { playlist, songs } = await setup();
      await addSong(playlist.id, (songs[0] as { id: string }).id);

      expect((await addSong(playlist.id, (songs[0] as { id: string }).id)).statusCode).toBe(204);

      expect(await prisma.playlistItem.count({ where: { playlistId: playlist.id } })).toBe(1);
    });

    it('answers 404 for a missing playlist or song', async () => {
      const { playlist, songs } = await setup();
      expect((await addSong('nope', (songs[0] as { id: string }).id)).statusCode).toBe(404);
      const response = await addSong(playlist.id, 'nope');
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('SONG_NOT_FOUND');
    });

    it('keeps the order of the others when a song is removed, and appends after the last one', async () => {
      const { playlist, songs } = await setup();
      for (const song of songs) await addSong(playlist.id, song.id);

      expect((await removeSong(playlist.id, (songs[1] as { id: string }).id)).statusCode).toBe(204);
      const another = await createSong({ title: 'D' });
      await addSong(playlist.id, another.id);

      expect(titlesOf(await detail(playlist.id))).toEqual(['A', 'C', 'D']);
    });

    it('removing a song that is not there does nothing', async () => {
      const { playlist } = await setup();
      expect((await removeSong(playlist.id, 'ghost')).statusCode).toBe(204);
    });

    it('reorders the songs', async () => {
      const { playlist, songs } = await setup();
      const [a, b, c] = songs.map((song) => song.id) as [string, string, string];
      const [a, b, c] = songs as [{ id: string }, { id: string }, { id: string }];
      expect((await reorder(playlist.id, [c, a, b])).statusCode).toBe(204);
      expect((await reorder(playlist.id, [c.id, a.id, b.id])).statusCode).toBe(204);

      expect(titlesOf(await detail(playlist.id))).toEqual(['C', 'A', 'B']);
    });

    it.each([
      ['a missing song', (ids: string[]) => ids.slice(0, 2)],
      ['a repeated song', (ids: string[]) => [ids[0], ids[0], ids[1]] as string[]],
      ['a song from outside', (ids: string[]) => [...ids.slice(0, 2), 'stranger']],
      ['an extra song', (ids: string[]) => [...ids, 'extra']],
    ])('refuses a new order with %s and keeps the old one', async (_name, change) => {
      const { playlist, songs } = await setup();
      for (const song of songs) await addSong(playlist.id, song.id);

      const response = await reorder(playlist.id, change(songs.map((song) => song.id)));

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_ORDER');
      expect(titlesOf(await detail(playlist.id))).toEqual(['A', 'B', 'C']);
    });

    it('shows the favorite mark and the status of each song for the playlist owner', async () => {
      const { profile, playlist, songs } = await setup();
      for (const song of songs) await addSong(playlist.id, song.id);
      await prisma.favorite.create({
        data: { profileId: profile.id, songId: (songs[1] as { id: string }).id },
      });

      const items = (await detail(playlist.id)).json().items as Array<{ title: string; isFavorite: boolean }>;

      expect(items.map((song) => [song.title, song.isFavorite])).toEqual([
        ['A', false],
        ['B', true],
        ['C', false],
      ]);
    });
  });

  describe('details, renaming and deleting', () => {
    it('shows the playlist with its owner', async () => {
      const { profile, playlist } = await setup();
      expect((await detail(playlist.id)).json()).toEqual({
        id: playlist.id,
        name: 'Sertanejo raiz',
        profileId: profile.id,
        items: [],
      });
    });

    it('answers 404 for a playlist that does not exist', async () => {
      expect((await detail('nope')).statusCode).toBe(404);
      expect((await rename('nope', 'X')).statusCode).toBe(404);
      expect((await remove('nope')).statusCode).toBe(404);
    });

    it('renames, trimming the name', async () => {
      const { playlist } = await setup();
      const response = await rename(playlist.id, '  Novo nome ');
      expect(response.json()).toMatchObject({ id: playlist.id, name: 'Novo nome' });
    });

    it('lets the playlist keep its own name and refuses another one that is taken', async () => {
      const { profile, playlist } = await setup();
      await create(profile.id, 'Festa');

      expect((await rename(playlist.id, 'Sertanejo raiz')).statusCode).toBe(200);
      expect((await rename(playlist.id, 'festa')).statusCode).toBe(409);
    });

    it('rejects an empty new name', async () => {
      const { playlist } = await setup();
      expect((await rename(playlist.id, '  ')).statusCode).toBe(400);
    });

    it('deletes the playlist and its items, but never the songs', async () => {
      const { playlist, songs } = await setup();
      for (const song of songs) await addSong(playlist.id, song.id);

      expect((await remove(playlist.id)).statusCode).toBe(204);

      expect(await prisma.playlist.count()).toBe(0);
      expect(await prisma.playlistItem.count()).toBe(0);
      expect(await prisma.song.count()).toBe(3);
    });

    it('deleting a song takes it out of the playlists', async () => {
      const { playlist, songs } = await setup();
      for (const song of songs) await addSong(playlist.id, song.id);

      await prisma.song.delete({ where: { id: (songs[0] as { id: string }).id } });

      expect(titlesOf(await detail(playlist.id))).toEqual(['B', 'C']);
    });

    it('deleting a profile deletes its playlists', async () => {
      const { profile } = await setup();
      await prisma.profile.delete({ where: { id: profile.id } });
      expect(await prisma.playlist.count()).toBe(0);
    });
  });
});
