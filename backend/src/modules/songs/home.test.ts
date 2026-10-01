import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { HomeResponse } from '@caraoke/shared';
import { createJobFixture, createSong } from '../../../test/fixtures.js';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';

const MINUTE_MS = 60_000;

describe('home route', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(resetDatabase);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function home(profileId?: string): Promise<HomeResponse> {
    const query = profileId ? `?profileId=${profileId}` : '';
    return (await app.inject({ method: 'GET', url: `/api/songs/home${query}` })).json();
  }
  const rowIds = (response: HomeResponse) => response.rows.map((row) => row.id);
  const rowTitles = (response: HomeResponse, id: string) =>
    response.rows.find((row) => row.id === id)?.items.map((item) => item.title);
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * MINUTE_MS);
  const createProfile = (name = 'Ana') => prisma.profile.create({ data: { name, avatar: 'lion' } });

  it('is empty for an empty library', async () => {
    expect(await home()).toEqual({ hero: null, rows: [] });
  });

  it('features the newest ready song and lists the recent ones', async () => {
    await createSong({ title: 'Old', createdAt: minutesAgo(30) });
    await createSong({ title: 'New', createdAt: minutesAgo(1) });
    await createSong({ title: 'Failed', status: 'ERROR', createdAt: minutesAgo(0) });

    const response = await home();

    expect(response.hero?.title).toBe('New');
    expect(rowTitles(response, 'recent')).toEqual(['New', 'Old']);
  });

  it('shows songs being processed in their own row, with the job, and hides the row when there are none', async () => {
    await createSong({ title: 'Ready' });
    expect(rowIds(await home())).not.toContain('processing');

    await createJobFixture({ title: 'Waiting', status: 'PENDING', songStatus: 'QUEUED' });
    const response = await home();

    expect(rowIds(response)[0]).toBe('processing');
    const waiting = response.rows[0]?.items[0];
    expect(waiting).toMatchObject({ title: 'Waiting', status: 'QUEUED', job: { status: 'PENDING' } });
  });

  it('never lists failed songs', async () => {
    await createSong({ title: 'Failed', status: 'ERROR' });
    expect(await home()).toEqual({ hero: null, rows: [] });
  });

  it('ranks the most sung songs and skips the ones nobody sang', async () => {
    await createSong({ title: 'Never', playCount: 0 });
    await createSong({ title: 'Some', playCount: 3 });
    await createSong({ title: 'Most', playCount: 9 });

    expect(rowTitles(await home(), 'top')).toEqual(['Most', 'Some']);
  });

  it('omits the most sung row when nothing was sung', async () => {
    await createSong({ title: 'Never', playCount: 0 });
    expect(rowIds(await home())).not.toContain('top');
  });

  describe('for a profile', () => {
    it('shows only that profile’s favorites, newest first, and flags them everywhere', async () => {
      const ana = await createProfile('Ana');
      const bia = await createProfile('Bia');
      const first = await createSong({ title: 'First fav', createdAt: minutesAgo(10) });
      const second = await createSong({ title: 'Second fav', createdAt: minutesAgo(5) });
      const others = await createSong({ title: 'Bia fav', createdAt: minutesAgo(1) });
      await prisma.favorite.create({
        data: { profileId: ana.id, songId: first.id, createdAt: minutesAgo(3) },
      });
      await prisma.favorite.create({
        data: { profileId: ana.id, songId: second.id, createdAt: minutesAgo(2) },
      });
      await prisma.favorite.create({ data: { profileId: bia.id, songId: others.id } });

      const response = await home(ana.id);

      expect(rowTitles(response, 'favorites')).toEqual(['Second fav', 'First fav']);
      const recent = response.rows.find((row) => row.id === 'recent');
      expect(recent?.items.map((item) => [item.title, item.isFavorite])).toEqual([
        ['Bia fav', false],
        ['Second fav', true],
        ['First fav', true],
      ]);
    });

    it('has no favorites row without a profile or without favorites', async () => {
      const ana = await createProfile();
      await createSong({ title: 'Song' });

      expect(rowIds(await home())).not.toContain('favorites');
      expect(rowIds(await home(ana.id))).not.toContain('favorites');
      expect((await home()).hero).not.toHaveProperty('isFavorite');
    });

    it('lists the songs the profile sang, most recent first and without repeats', async () => {
      const ana = await createProfile();
      const a = await createSong({ title: 'A' });
      const b = await createSong({ title: 'B' });
      const c = await createSong({ title: 'C', status: 'ERROR' });
      for (const [song, minutes] of [
        [a, 30],
        [b, 20],
        [a, 10],
        [c, 5],
      ] as const) {
        await prisma.performance.create({
          data: { profileId: ana.id, songId: song.id, startedAt: minutesAgo(minutes) },
        });
      }

      expect(rowTitles(await home(ana.id), 'mine')).toEqual(['A', 'B']);
    });

    it('does not show what other people sang', async () => {
      const ana = await createProfile('Ana');
      const bia = await createProfile('Bia');
      const song = await createSong();
      await prisma.performance.create({ data: { profileId: bia.id, songId: song.id } });

      expect(rowIds(await home(ana.id))).not.toContain('mine');
    });
  });

  describe('artist rows', () => {
    async function createArtist(artist: string, count: number) {
      for (let index = 1; index <= count; index++) await createSong({ title: `${artist} ${index}`, artist });
    }

    it('shows artists with at least three songs, the biggest first, up to three rows', async () => {
      await createArtist('Two songs', 2);
      await createArtist('Three songs', 3);
      await createArtist('Five songs', 5);
      await createArtist('Four songs', 4);
      await createArtist('Six songs', 6);

      const response = await home();

      expect(rowIds(response).filter((id) => id.startsWith('artist:'))).toEqual([
        'artist:Six songs',
        'artist:Five songs',
        'artist:Four songs',
      ]);
      expect(rowTitles(response, 'artist:Five songs')).toEqual([
        'Five songs 1',
        'Five songs 2',
        'Five songs 3',
        'Five songs 4',
        'Five songs 5',
      ]);
    });

    it('does not count songs that are not ready', async () => {
      await createArtist('Almost', 2);
      await createSong({ title: 'Failed', artist: 'Almost', status: 'ERROR' });

      expect(rowIds(await home()).some((id) => id.startsWith('artist:'))).toBe(false);
    });
  });

  it('keeps every row to 20 songs', async () => {
    for (let index = 1; index <= 25; index++) {
      await createSong({ title: `Song ${index}`, createdAt: minutesAgo(index) });
    }

    expect((await home()).rows.find((row) => row.id === 'recent')?.items).toHaveLength(20);
  });

  it('orders the rows the way the home screen shows them', async () => {
    const ana = await createProfile();
    const song = await createSong({ title: 'Sung', playCount: 2, artist: 'Band' });
    await createSong({ title: 'B2', artist: 'Band' });
    await createSong({ title: 'B3', artist: 'Band' });
    await prisma.favorite.create({ data: { profileId: ana.id, songId: song.id } });
    await prisma.performance.create({ data: { profileId: ana.id, songId: song.id } });
    await createJobFixture({ title: 'Waiting', songStatus: 'QUEUED' });

    expect(rowIds(await home(ana.id))).toEqual([
      'processing',
      'favorites',
      'top',
      'recent',
      'mine',
      'artist:Band',
    ]);
  });
});
