import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSong } from '../../../test/fixtures.js';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { emitToAll, emitToRoom } from '../../realtime.js';
import { audienceScoreOf, cancelOpenVoting, computeFinalScore } from './voting.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn(), disconnectRoom: vi.fn() }));

const PHONE = { remoteAddress: '192.168.0.50', headers: { 'x-access-code': 'ABC234' } };
const TOKEN_A = 'phone-token-aaaa';
const TOKEN_B = 'phone-token-bbbb';
const TOKEN_C = 'phone-token-cccc';

describe('computeFinalScore', () => {
  it('follows the scoring mode', () => {
    expect(computeFinalScore('off', 80, 90, 0.2)).toBeNull();
    expect(computeFinalScore('pitch', 80, 90, 0.2)).toBe(80);
    expect(computeFinalScore('audience', 80, 90, 0.2)).toBe(90);
    expect(computeFinalScore('pitch+audience', 80, 90, 0.2)).toBe(82);
    expect(computeFinalScore('pitch+audience', 80, 90, 0.5)).toBe(85);
  });

  it('uses the part that exists when the other one is missing', () => {
    expect(computeFinalScore('pitch+audience', null, 90, 0.2)).toBe(90);
    expect(computeFinalScore('pitch+audience', 80, null, 0.2)).toBe(80);
    expect(computeFinalScore('pitch+audience', null, null, 0.2)).toBeNull();
    expect(computeFinalScore('pitch', null, 90, 0.2)).toBeNull();
  });

  it('turns the stars into 0..100', () => {
    expect(audienceScoreOf([])).toBeNull();
    expect(audienceScoreOf([5, 5])).toBe(100);
    expect(audienceScoreOf([4, 5, 3])).toBe(80);
    expect(audienceScoreOf([1])).toBe(20);
  });
});

describe('voting routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(emitToAll).mockClear();
    vi.mocked(emitToRoom).mockClear();
    await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });
  });

  afterEach(() => {
    cancelOpenVoting();
    vi.useRealTimers();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const setMode = (mode: string) => prisma.setting.create({ data: { key: 'scoring.mode', value: mode } });
  const emitted = (event: string) => vi.mocked(emitToAll).mock.calls.filter(([name]) => name === event);

  async function finishedSong(pitchScore: number | null = null, completed = true) {
    const singer = await prisma.profile.create({ data: { name: 'Carla', avatar: 'frog', isGuest: true } });
    const song = await createSong({ title: 'Evidências' });
    const { id } = (
      await app.inject({
        method: 'POST',
        url: '/api/performances',
        payload: { profileId: singer.id, songId: song.id },
      })
    ).json();
    const finish = await app.inject({
      method: 'POST',
      url: `/api/performances/${id}/finish`,
      payload: { completed, voiceGuideUsed: false, pitchScore },
    });
    return { id: id as string, singer, finish };
  }

  const vote = (id: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: `/api/performances/${id}/votes`, payload, ...PHONE });
  const close = (id: string) => app.inject({ method: 'POST', url: `/api/performances/${id}/voting/close` });
  const current = () => app.inject({ method: 'GET', url: '/api/performances/voting/current', ...PHONE });

  it('opens the voting when a song ends, for the time set, and tells everyone', async () => {
    await prisma.setting.create({ data: { key: 'scoring.voteSeconds', value: 15 } });
    const before = Date.now();

    const { id, finish } = await finishedSong(70);

    const { endsAt } = finish.json().voting;
    expect(new Date(endsAt).getTime() - before).toBeGreaterThanOrEqual(15000);
    expect(new Date(endsAt).getTime() - before).toBeLessThan(17000);
    expect(emitted('vote:open')[0]?.[1]).toMatchObject({
      performanceId: id,
      singer: { name: 'Carla', avatar: 'frog' },
      song: { title: 'Evidências' },
      endsAt,
    });
  });

  it('shows the open voting to a phone that arrives late', async () => {
    const { id, singer } = await finishedSong();

    const response = await current();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ performanceId: id, singer: { id: singer.id, name: 'Carla' } });
  });

  it('answers null when there is no voting', async () => {
    expect((await current()).json()).toBeNull();
  });

  it('does not open a voting for a song left halfway, nor when the audience does not count', async () => {
    await finishedSong(null, false);
    expect(emitted('vote:open')).toHaveLength(0);

    await setMode('pitch');
    const { finish } = await finishedSong(64);
    expect(finish.json()).toEqual({ finalScore: 64 });
    expect(emitted('vote:open')).toHaveLength(0);
  });

  it('counts the votes from the phones and tells the stage how many arrived', async () => {
    const { id } = await finishedSong();

    const first = await vote(id, { voterToken: TOKEN_A, stars: 5 });
    await vote(id, { voterToken: TOKEN_B, stars: 3 });

    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ votes: 1 });
    expect(vi.mocked(emitToRoom).mock.calls.at(-1)).toEqual([
      'stage',
      'vote:progress',
      { performanceId: id, count: 2 },
    ]);
  });

  it('accepts one vote per phone', async () => {
    const { id } = await finishedSong();
    await vote(id, { voterToken: TOKEN_A, stars: 5 });

    const again = await vote(id, { voterToken: TOKEN_A, stars: 1 });

    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('ALREADY_VOTED');
    expect(await prisma.vote.count()).toBe(1);
  });

  it('does not let the singer vote for themselves', async () => {
    const { id, singer } = await finishedSong();
    const friend = await prisma.profile.create({ data: { name: 'Duda', avatar: 'cat', isGuest: true } });

    const own = await vote(id, { voterToken: TOKEN_A, voterProfileId: singer.id, stars: 5 });
    const friendly = await vote(id, { voterToken: TOKEN_B, voterProfileId: friend.id, stars: 5 });

    expect(own.statusCode).toBe(409);
    expect(own.json().error.code).toBe('CANNOT_VOTE_FOR_SELF');
    expect(friendly.statusCode).toBe(200);
  });

  it('validates the vote', async () => {
    const { id } = await finishedSong();
    for (const payload of [
      { voterToken: TOKEN_A, stars: 0 },
      { voterToken: TOKEN_A, stars: 6 },
      { voterToken: 'x', stars: 3 },
      { stars: 3 },
    ]) {
      expect((await vote(id, payload)).statusCode).toBe(400);
    }
  });

  it('closes on request, mixing the pitch and the audience, and announces the final score', async () => {
    const { id } = await finishedSong(70);
    await vote(id, { voterToken: TOKEN_A, stars: 5 });
    await vote(id, { voterToken: TOKEN_B, stars: 4 });
    await vote(id, { voterToken: TOKEN_C, stars: 3 });

    const response = await close(id);

    const expected = { performanceId: id, pitchScore: 70, audienceScore: 80, finalScore: 72, votes: 3 };
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expected);
    expect(emitted('score:final')[0]?.[1]).toEqual(expected);
    expect(await prisma.performance.findUniqueOrThrow({ where: { id } })).toMatchObject({
      audienceScore: 80,
      finalScore: 72,
    });
  });

  it('gives no score when nobody voted and there was no microphone', async () => {
    const { id } = await finishedSong(null);

    expect((await close(id)).json()).toMatchObject({ audienceScore: null, finalScore: null, votes: 0 });
  });

  it('refuses votes after it closes and cannot close twice', async () => {
    const { id } = await finishedSong();
    await close(id);

    const late = await vote(id, { voterToken: TOKEN_A, stars: 5 });
    const twice = await close(id);

    expect(late.statusCode).toBe(409);
    expect(late.json().error.code).toBe('VOTING_CLOSED');
    expect(twice.statusCode).toBe(409);
    expect((await current()).json()).toBeNull();
  });

  it('answers 404 when voting on an unknown performance', async () => {
    expect((await vote('nope', { voterToken: TOKEN_A, stars: 5 })).statusCode).toBe(404);
  });

  it('closes the previous voting when the next song ends', async () => {
    const first = await finishedSong();
    await vote(first.id, { voterToken: TOKEN_A, stars: 5 });

    const second = await finishedSong();

    expect(emitted('score:final')[0]?.[1]).toMatchObject({ performanceId: first.id, finalScore: 100 });
    expect((await current()).json()).toMatchObject({ performanceId: second.id });
  });

  it('closes by itself when the time is up', async () => {
    await prisma.setting.create({ data: { key: 'scoring.voteSeconds', value: 5 } });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { id } = await finishedSong(90);

    await vi.advanceTimersByTimeAsync(5000);
    vi.useRealTimers();

    await expect.poll(() => emitted('score:final').length, { timeout: 3000 }).toBe(1);
    expect(emitted('score:final')[0]?.[1]).toMatchObject({ performanceId: id, finalScore: 90 });
  });

  it('cannot be closed by a phone', async () => {
    const { id } = await finishedSong();
    const response = await app.inject({
      method: 'POST',
      url: `/api/performances/${id}/voting/close`,
      ...PHONE,
    });
    expect(response.statusCode).toBe(401);
  });
});
