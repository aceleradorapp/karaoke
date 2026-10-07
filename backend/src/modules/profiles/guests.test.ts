import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSong } from '../../../test/fixtures.js';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { listStaleGuests } from './guests.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn(), disconnectRoom: vi.fn() }));

const DAY_MS = 24 * 60 * 60 * 1000;

describe('guests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function guest(name: string, createdDaysAgo = 0) {
    return prisma.profile.create({
      data: { name, avatar: 'lion', isGuest: true, createdAt: new Date(Date.now() - createdDaysAgo * DAY_MS) },
    });
  }

  async function sang(profileId: string, daysAgo: number) {
    const song = await createSong();
    await prisma.performance.create({
      data: { profileId, songId: song.id, startedAt: new Date(Date.now() - daysAgo * DAY_MS) },
    });
  }

  it('lists only the guests, who sang most recently first, with how many times', async () => {
    await prisma.profile.create({ data: { name: 'Michael', avatar: 'lion' } });
    const ana = await guest('Ana', 10);
    const bia = await guest('Bia', 1);
    const caio = await guest('Caio', 50);
    await sang(ana.id, 5);
    await sang(ana.id, 2);
    await sang(caio.id, 40);

    const items = (await app.inject({ method: 'GET', url: '/api/profiles/guests' })).json().items;

    expect(items.map((item: { name: string }) => item.name)).toEqual(['Bia', 'Ana', 'Caio']);
    expect(items[1]).toMatchObject({ name: 'Ana', timesSung: 2, isGuest: true });
    expect(Date.parse(items[1].lastSungAt)).toBeGreaterThan(Date.now() - 3 * DAY_MS);
    expect(items[0]).toMatchObject({ name: 'Bia', timesSung: 0, lastSungAt: null });
  });

  it('finds the guests who have not sung for a month, counting the creation date for who never sang', async () => {
    const recent = await guest('Recente', 60);
    await sang(recent.id, 3);
    const old = await guest('Antigo', 90);
    await sang(old.id, 45);
    await guest('Nunca cantou', 40);
    await guest('Acabou de chegar', 2);

    const stale = await listStaleGuests(30);
    expect(stale.map((item) => item.name).sort()).toEqual(['Antigo', 'Nunca cantou']);

    const preview = (await app.inject({ method: 'GET', url: '/api/profiles/guests/stale?days=30' })).json();
    expect(preview.items).toHaveLength(2);
  });

  it('deletes several guests with everything they sang, never a profile of the house', async () => {
    const house = await prisma.profile.create({ data: { name: 'Michael', avatar: 'lion' } });
    const ana = await guest('Ana');
    const bia = await guest('Bia');
    await sang(ana.id, 1);

    const response = await app.inject({
      method: 'POST',
      url: '/api/profiles/guests/delete-many',
      payload: { ids: [ana.id, bia.id, house.id] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().deleted.sort()).toEqual([ana.id, bia.id].sort());
    expect(await prisma.profile.findMany({ select: { name: true } })).toEqual([{ name: 'Michael' }]);
    expect(await prisma.performance.count()).toBe(0);
  });

  it('turns a frequent guest into a profile of the house', async () => {
    const ana = await guest('Ana');

    const response = await app.inject({ method: 'PATCH', url: `/api/profiles/${ana.id}`, payload: { isGuest: false } });

    expect(response.json().isGuest).toBe(false);
  });

  it('keeps the guest management for the stage only', async () => {
    const fromPhone = await app.inject({ method: 'GET', url: '/api/profiles/guests', remoteAddress: '192.168.0.50' });
    expect(fromPhone.statusCode).toBe(401);
  });
});
