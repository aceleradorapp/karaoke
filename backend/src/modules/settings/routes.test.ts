import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { emitToRoom } from '../../realtime.js';
import { DEFAULT_APP_SETTINGS } from './defaults.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn() }));

describe('settings routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(emitToRoom).mockClear();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const patch = (payload: Record<string, unknown>) =>
    app.inject({ method: 'PATCH', url: '/api/settings', payload });

  it('returns the defaults when nothing was changed', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(response.json()).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('never exposes the access code', async () => {
    await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });
    const response = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(response.json()).not.toHaveProperty('access.code');
  });

  it('persists a partial update and keeps the other values', async () => {
    const response = await patch({ 'processing.device': 'cpu', 'ui.defaultTheme': 'neon' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ...DEFAULT_APP_SETTINGS,
      'processing.device': 'cpu',
      'ui.defaultTheme': 'neon',
    });

    const reloaded = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(reloaded.json()['processing.device']).toBe('cpu');
  });

  it('overwrites a previously stored value', async () => {
    await patch({ 'processing.autoAlign': false });
    await patch({ 'processing.autoAlign': true });
    const response = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(response.json()['processing.autoAlign']).toBe(true);
  });

  it('notifies the stage when settings change', async () => {
    await patch({ 'processing.whisperModel': 'medium' });

    expect(emitToRoom).toHaveBeenCalledWith(
      'stage',
      'settings:updated',
      expect.objectContaining({ 'processing.whisperModel': 'medium' }),
    );
  });

  it('rejects invalid values and unknown changes', async () => {
    const badDevice = await patch({ 'processing.device': 'quantum' });
    const badWeight = await patch({ 'scoring.audienceWeight': 3 });
    const badTheme = await patch({ 'ui.defaultTheme': 'nope' });
    const empty = await patch({});

    for (const response of [badDevice, badWeight, badTheme, empty]) {
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('stays out of reach for phones', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/settings',
      remoteAddress: '192.168.0.50',
    });
    expect(response.statusCode).toBe(401);
  });
});
