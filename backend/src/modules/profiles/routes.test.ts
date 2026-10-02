import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { emitToAll } from '../../realtime.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn(), disconnectRoom: vi.fn() }));

describe('profile routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(resetDatabase);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function createProfile(payload: Record<string, unknown>) {
    return app.inject({ method: 'POST', url: '/api/profiles', payload });
  }

  it('creates a profile with the default theme', async () => {
    const response = await createProfile({ name: '  Ana  ', avatar: 'lion' });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: 'Ana', avatar: 'lion', theme: 'cinema', isGuest: false });
  });

  it('rejects invalid input with the standard error format', async () => {
    const emptyName = await createProfile({ name: '   ', avatar: 'lion' });
    const unknownAvatar = await createProfile({ name: 'Ana', avatar: 'nope' });
    const unknownTheme = await createProfile({ name: 'Ana', avatar: 'lion', theme: 'nope' });

    for (const response of [emptyName, unknownAvatar, unknownTheme]) {
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('lists the family first (oldest first) and guests after (most recent first)', async () => {
    const base = Date.now();
    await prisma.profile.create({
      data: { name: 'Guest old', avatar: 'cat', isGuest: true, lastUsedAt: new Date(base - 5000) },
    });
    await prisma.profile.create({
      data: { name: 'Guest new', avatar: 'dog', isGuest: true, lastUsedAt: new Date(base) },
    });
    await prisma.profile.create({
      data: { name: 'Second', avatar: 'fox', createdAt: new Date(base - 1000) },
    });
    await prisma.profile.create({
      data: { name: 'First', avatar: 'star', createdAt: new Date(base - 2000) },
    });

    const response = await app.inject({ method: 'GET', url: '/api/profiles' });

    const names = response.json().items.map((profile: { name: string }) => profile.name);
    expect(names).toEqual(['First', 'Second', 'Guest new', 'Guest old']);
  });

  it('updates only the informed fields', async () => {
    const { id } = (await createProfile({ name: 'Ana', avatar: 'lion' })).json();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/profiles/${id}`,
      payload: { theme: 'neon' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: 'Ana', avatar: 'lion', theme: 'neon' });
  });

  it('rejects an update without changes', async () => {
    const { id } = (await createProfile({ name: 'Ana', avatar: 'lion' })).json();
    const response = await app.inject({ method: 'PATCH', url: `/api/profiles/${id}`, payload: {} });
    expect(response.statusCode).toBe(400);
  });

  it('refreshes lastUsedAt when a profile is touched', async () => {
    const created = await prisma.profile.create({
      data: { name: 'Ana', avatar: 'lion', lastUsedAt: new Date(Date.now() - 60_000) },
    });

    const response = await app.inject({ method: 'POST', url: `/api/profiles/${created.id}/touch` });

    expect(new Date(response.json().lastUsedAt).getTime()).toBeGreaterThan(created.lastUsedAt.getTime());
  });

  it('deletes a profile and answers 404 afterwards', async () => {
    const { id } = (await createProfile({ name: 'Ana', avatar: 'lion' })).json();

    const deleted = await app.inject({ method: 'DELETE', url: `/api/profiles/${id}` });
    expect(deleted.statusCode).toBe(204);

    const again = await app.inject({ method: 'DELETE', url: `/api/profiles/${id}` });
    expect(again.statusCode).toBe(404);
    expect(again.json().error.code).toBe('PROFILE_NOT_FOUND');
  });

  it('answers 404 when updating or touching an unknown profile', async () => {
    const patch = await app.inject({ method: 'PATCH', url: '/api/profiles/unknown', payload: { name: 'X' } });
    const touch = await app.inject({ method: 'POST', url: '/api/profiles/unknown/touch' });
    expect(patch.statusCode).toBe(404);
    expect(touch.statusCode).toBe(404);
  });

  it('tells the screens when profiles are created, changed or deleted', async () => {
    vi.mocked(emitToAll).mockClear();
    const { id } = (await createProfile({ name: 'Ana', avatar: 'lion' })).json();
    await app.inject({ method: 'PATCH', url: `/api/profiles/${id}`, payload: { name: 'Ana Maria' } });
    await app.inject({ method: 'DELETE', url: `/api/profiles/${id}` });

    const events = vi.mocked(emitToAll).mock.calls.map(([event]) => event);
    expect(events.filter((event) => event === 'profiles:changed')).toHaveLength(3);
  });

  describe('from a phone', () => {
    const PHONE = { remoteAddress: '192.168.0.50', headers: { 'x-access-code': 'ABC234' } };

    beforeEach(async () => {
      await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });
    });

    it('lists the profiles so the guest can say who they are', async () => {
      await createProfile({ name: 'Ana', avatar: 'lion' });

      const response = await app.inject({ method: 'GET', url: '/api/profiles', ...PHONE });

      expect(response.statusCode).toBe(200);
      expect(response.json().items.map((profile: { name: string }) => profile.name)).toEqual(['Ana']);
    });

    it('always creates a guest with the default theme, whatever the phone asks', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/profiles',
        ...PHONE,
        payload: { name: 'Carla', avatar: 'frog', theme: 'neon', isGuest: false },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        name: 'Carla',
        avatar: 'frog',
        theme: 'cinema',
        isGuest: true,
      });
    });

    it('cannot edit, touch or delete profiles', async () => {
      const { id } = (await createProfile({ name: 'Ana', avatar: 'lion' })).json();

      const attempts = await Promise.all([
        app.inject({ method: 'PATCH', url: `/api/profiles/${id}`, ...PHONE, payload: { name: 'X' } }),
        app.inject({ method: 'POST', url: `/api/profiles/${id}/touch`, ...PHONE }),
        app.inject({ method: 'DELETE', url: `/api/profiles/${id}`, ...PHONE }),
      ]);

      expect(attempts.map((response) => response.statusCode)).toEqual([401, 401, 401]);
      expect(await prisma.profile.count()).toBe(1);
    });
  });
});
