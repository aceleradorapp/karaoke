import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSong, resetStorage } from '../../../test/fixtures.js';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { emitToAll } from '../../realtime.js';
import { songDir } from '../../services/storage.js';
import { resetPlayerState } from './service.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn(), disconnectRoom: vi.fn() }));

const PHONE = { remoteAddress: '192.168.0.50', headers: { 'x-access-code': 'ABC234' } };
const EFFECT = { enabled: true, id: 'smooth', fillPercent: 100 };

describe('player state', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await resetDatabase();
    resetPlayerState();
    vi.mocked(emitToAll).mockClear();
    await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const report = (payload: Record<string, unknown>, extra: object = {}) =>
    app.inject({ method: 'POST', url: '/api/player/state', payload, ...extra });
  const playing = (songId: string, position = 12.5) => ({
    songId,
    singer: { name: 'Carla', avatar: 'frog' },
    position,
    playing: true,
    offsetMs: -200,
    effect: EFFECT,
  });

  it('keeps what the TV is playing, stamps the time and tells the phones', async () => {
    const song = await createSong({ title: 'Evidências' });
    const before = Date.now();

    const response = await report(playing(song.id));

    expect(response.statusCode).toBe(200);
    const state = response.json();
    expect(state).toMatchObject({
      song: { id: song.id, title: 'Evidências' },
      singer: { name: 'Carla' },
      position: 12.5,
      playing: true,
      offsetMs: -200,
      effect: EFFECT,
    });
    expect(state.at).toBeGreaterThanOrEqual(before);
    expect(vi.mocked(emitToAll)).toHaveBeenCalledWith('player:state', state);
  });

  it('lets a phone that arrives late read the state', async () => {
    const song = await createSong({ title: 'Evidências' });
    await report(playing(song.id));

    const response = await app.inject({ method: 'GET', url: '/api/player/state', ...PHONE });

    expect(response.statusCode).toBe(200);
    expect(response.json().song.id).toBe(song.id);
  });

  it('clears the state when the TV stops', async () => {
    const song = await createSong({ title: 'Evidências' });
    await report(playing(song.id));

    await report({ stopped: true });

    expect((await app.inject({ method: 'GET', url: '/api/player/state' })).json()).toBeNull();
    expect(vi.mocked(emitToAll)).toHaveBeenLastCalledWith('player:state', null);
  });

  it('refuses unknown songs and invalid bodies', async () => {
    expect((await report(playing('nope'))).statusCode).toBe(404);
    expect((await report({ songId: 'x' })).statusCode).toBe(400);
  });

  it('does not let a phone change the state', async () => {
    const song = await createSong({ title: 'Evidências' });
    expect((await report(playing(song.id), PHONE)).statusCode).toBe(401);
  });

  it('tells the phones the time of the PC, to keep the lyrics in step', async () => {
    const before = Date.now();
    const response = await app.inject({ method: 'GET', url: '/api/system/time', ...PHONE });

    expect(response.statusCode).toBe(200);
    expect(response.json().now).toBeGreaterThanOrEqual(before);
  });

  it('gives the lyrics to a phone with the code, but still not the audio', async () => {
    await resetStorage();
    const song = await createSong({ title: 'Evidências' });
    await fs.mkdir(songDir(song.id), { recursive: true });
    await fs.writeFile(path.join(songDir(song.id), 'letra.json'), '{"lines":[]}');
    await fs.writeFile(path.join(songDir(song.id), 'voz.mp3'), 'audio');

    const lyrics = await app.inject({
      method: 'GET',
      url: `/media/${song.id}/letra.json?c=ABC234`,
      remoteAddress: '192.168.0.50',
    });
    const withoutCode = await app.inject({
      method: 'GET',
      url: `/media/${song.id}/letra.json`,
      remoteAddress: '192.168.0.50',
    });
    const audio = await app.inject({
      method: 'GET',
      url: `/media/${song.id}/voz.mp3?c=ABC234`,
      remoteAddress: '192.168.0.50',
    });

    expect(lyrics.statusCode).toBe(200);
    expect(withoutCode.statusCode).toBe(401);
    expect(audio.statusCode).toBe(401);
  });
});
