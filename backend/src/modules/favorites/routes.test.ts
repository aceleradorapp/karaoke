import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSong } from '../../../test/fixtures.js';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';

describe('favorite routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(resetDatabase);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const list = (profileId: string) =>
    app.inject({ method: 'GET', url: `/api/profiles/${profileId}/favorites` });
  const add = (profileId: string, songId: string) =>
    app.inject({ method: 'PUT', url: `/api/profiles/${profileId}/favorites/${songId}` });
  const remove = (profileId: string, songId: string) =>
    app.inject({ method: 'DELETE', url: `/api/profiles/${profileId}/favorites/${songId}` });
  const songDetail = (songId: string, profileId?: string) =>
    app.inject({ method: 'GET', url: `/api/songs/${songId}${profileId ? `?profileId=${profileId}` : ''}` });

  async function setup() {
    const ana = await prisma.profile.create({ data: { name: 'Ana', avatar: 'lion' } });
    const bia = await prisma.profile.create({ data: { name: 'Bia', avatar: 'cat' } });
    const first = await createSong({ title: 'First' });
    const second = await createSong({ title: 'Second' });
    return { ana, bia, first, second };
  }

  it('favorites a song and lists it marked as favorite', async () => {
    const { ana, first } = await setup();

    expect((await add(ana.id, first.id)).statusCode).toBe(204);

    const items = (await list(ana.id)).json().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: first.id, title: 'First', isFavorite: true });
  });

  it('is safe to favorite twice', async () => {
    const { ana, first } = await setup();
    await add(ana.id, first.id);

    expect((await add(ana.id, first.id)).statusCode).toBe(204);

    expect(await prisma.favorite.count()).toBe(1);
  });

  it('lists the most recent favorite first', async () => {
    const { ana, first, second } = await setup();
    await prisma.favorite.create({
      data: { profileId: ana.id, songId: first.id, createdAt: new Date('2026-01-01T10:00:00Z') },
    });
    await prisma.favorite.create({
      data: { profileId: ana.id, songId: second.id, createdAt: new Date('2026-02-01T10:00:00Z') },
    });

    expect((await list(ana.id)).json().items.map((song: { title: string }) => song.title)).toEqual([
      'Second',
      'First',
    ]);
  });

  it('keeps the favorites of each profile separate', async () => {
    const { ana, bia, first } = await setup();
    await add(ana.id, first.id);

    expect((await list(bia.id)).json().items).toEqual([]);
    expect((await songDetail(first.id, ana.id)).json().isFavorite).toBe(true);
    expect((await songDetail(first.id, bia.id)).json().isFavorite).toBe(false);
    expect((await songDetail(first.id)).json()).not.toHaveProperty('isFavorite');
  });

  it('removes a favorite, and removing one that is not there does nothing', async () => {
    const { ana, first, second } = await setup();
    await add(ana.id, first.id);

    expect((await remove(ana.id, first.id)).statusCode).toBe(204);
    expect((await remove(ana.id, second.id)).statusCode).toBe(204);

    expect((await list(ana.id)).json().items).toEqual([]);
  });

  it('answers 404 for a missing profile or song', async () => {
    const { ana, first } = await setup();

    expect((await list('nobody')).statusCode).toBe(404);
    expect((await add('nobody', first.id)).statusCode).toBe(404);
    expect((await remove('nobody', first.id)).statusCode).toBe(404);
    const response = await add(ana.id, 'nothing');
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('SONG_NOT_FOUND');
  });

  it('removes the favorite when the song is deleted', async () => {
    const { ana, first } = await setup();
    await add(ana.id, first.id);

    await prisma.song.delete({ where: { id: first.id } });

    expect((await list(ana.id)).json().items).toEqual([]);
  });
});
