import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSong } from '../../../test/fixtures.js';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { getRanking, monthStart, periodStart } from './service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('ranking', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(resetDatabase);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

  async function sing(
    profileId: string,
    songId: string,
    {
      score = null,
      days = 1,
      completed = true,
    }: { score?: number | null; days?: number; completed?: boolean } = {},
  ) {
    await prisma.performance.create({
      data: {
        profileId,
        songId,
        finalScore: score,
        completed,
        startedAt: daysAgo(days),
        finishedAt: daysAgo(days),
      },
    });
  }

  async function party() {
    const ana = await prisma.profile.create({ data: { name: 'Ana', avatar: 'lion' } });
    const bia = await prisma.profile.create({ data: { name: 'Bia', avatar: 'cat' } });
    const carla = await prisma.profile.create({ data: { name: 'Carla', avatar: 'frog', isGuest: true } });
    const evidencias = await createSong({ title: 'Evidências' });
    const azul = await createSong({ title: 'Azul' });
    for (const score of [80, 90, 70]) await sing(ana.id, evidencias.id, { score });
    for (const score of [95, 99, 97]) await sing(carla.id, azul.id, { score });
    for (const score of [60, 65]) await sing(bia.id, evidencias.id, { score });
    await sing(bia.id, evidencias.id, { score: null, completed: false });
    return { ana, bia, carla, evidencias, azul };
  }

  const ranking = async (query = '') =>
    (await app.inject({ method: 'GET', url: `/api/ranking${query}` })).json();

  it('ranks the best averages with at least 3 scored performances, family and guests together', async () => {
    await party();

    const { bestAverage, champion } = await ranking('?period=all');

    expect(
      bestAverage.map((row: { profile: { name: string }; avg: number; count: number }) => [
        row.profile.name,
        row.avg,
        row.count,
      ]),
    ).toEqual([
      ['Carla', 97, 3],
      ['Ana', 80, 3],
    ]);
    expect(champion).toMatchObject({ profile: { name: 'Carla', isGuest: true }, avg: 97 });
  });

  it('shows only the family when asked', async () => {
    await party();

    const { bestAverage, mostSung, champion } = await ranking('?period=all&scope=family');

    expect(bestAverage.map((row: { profile: { name: string } }) => row.profile.name)).toEqual(['Ana']);
    expect(mostSung.every((row: { profile: { isGuest: boolean } }) => !row.profile.isGuest)).toBe(true);
    expect(champion.profile.name).toBe('Ana');
  });

  it('counts who sang most and the most sung songs, only with songs sung to the end', async () => {
    await party();

    const { mostSung, topSongs } = await ranking('?period=all');

    const counts = mostSung.map(
      (row: { profile: { name: string }; count: number }) => `${row.profile.name}:${row.count}`,
    );
    expect(counts.slice(0, 2).sort()).toEqual(['Ana:3', 'Carla:3']);
    expect(counts[2]).toBe('Bia:2');
    expect(
      topSongs.map((row: { song: { title: string }; count: number }) => [row.song.title, row.count]),
    ).toEqual([
      ['Evidências', 5],
      ['Azul', 3],
    ]);
  });

  it('looks only at the chosen period', async () => {
    const { ana, evidencias } = await party();
    for (const score of [100, 100, 100, 100]) await sing(ana.id, evidencias.id, { score, days: 20 });

    const week = await ranking('?period=week');
    const month = await ranking('?period=month');

    expect(
      week.bestAverage.find((row: { profile: { name: string } }) => row.profile.name === 'Ana').count,
    ).toBe(3);
    expect(
      month.bestAverage.find((row: { profile: { name: string } }) => row.profile.name === 'Ana').count,
    ).toBe(7);
  });

  it('uses the month by default and is empty without performances', async () => {
    expect(await ranking()).toEqual({ bestAverage: [], mostSung: [], topSongs: [], champion: null });
  });

  it('validates the query', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/ranking?period=year' });
    expect(response.statusCode).toBe(400);
  });

  it('computes the periods from now', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    expect(periodStart('all', now)).toBeNull();
    expect(periodStart('week', now)?.toISOString()).toBe('2026-10-13T12:00:00.000Z');
    expect(monthStart(now).getDate()).toBe(1);
    expect(monthStart(now).getMonth()).toBe(now.getMonth());
  });

  it('takes the champion of the calendar month even when looking at the whole history', async () => {
    const { ana, evidencias } = await party();
    const now = new Date();
    const lastMonth = Math.max(now.getDate() + 3, 35);
    for (const score of [100, 100, 100]) await sing(ana.id, evidencias.id, { score, days: lastMonth });

    const result = await getRanking('all', 'family');

    expect(result.bestAverage[0]?.profile.name).toBe('Ana');
    expect(result.champion?.avg).toBe(80);
  });
});
