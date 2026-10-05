import fs from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSong, resetStorage } from '../../../test/fixtures.js';
import { buildMultipart } from '../../../test/multipart.js';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { emitToAll } from '../../realtime.js';
import { songDir } from '../../services/storage.js';
import { cancelOpenVoting } from '../performances/voting.js';
import { rankScoreboard, roundRobin } from './service.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn(), disconnectRoom: vi.fn() }));

const PHONE = { remoteAddress: '192.168.0.50', headers: { 'x-access-code': 'ABC234' } };

describe('competitions', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await resetDatabase();
    vi.mocked(emitToAll).mockClear();
  });

  afterEach(cancelOpenVoting);

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, ...(payload ? { payload } : {}) });
  const create = async (name = 'Festa da Família') =>
    (await call('POST', '/api/competitions', { name })).json();
  const profile = (name: string, isGuest = false) =>
    prisma.profile.create({ data: { name, avatar: 'lion', isGuest } });

  async function readyCompetition() {
    const competition = await create();
    const [ana, bia] = await Promise.all([profile('Ana'), profile('Bia', true)]);
    const songs = await Promise.all(['S1', 'S2', 'S3', 'S4'].map((title) => createSong({ title })));
    await call('PUT', `/api/competitions/${competition.id}/participants`, { profileIds: [ana.id, bia.id] });
    await call('POST', `/api/competitions/${competition.id}/songs`, {
      profileId: ana.id,
      songId: songs[0]!.id,
    });
    await call('POST', `/api/competitions/${competition.id}/songs`, {
      profileId: ana.id,
      songId: songs[1]!.id,
    });
    await call('POST', `/api/competitions/${competition.id}/songs`, {
      profileId: bia.id,
      songId: songs[2]!.id,
    });
    await call('POST', `/api/competitions/${competition.id}/songs`, {
      profileId: bia.id,
      songId: songs[3]!.id,
    });
    return { id: competition.id as string, ana, bia, songs };
  }

  describe('creating and editing', () => {
    it('creates a draft with the rules taken from the settings', async () => {
      await prisma.setting.create({ data: { key: 'scoring.mode', value: 'pitch+audience' } });

      const competition = await create('Noite das Divas');

      expect(competition).toMatchObject({
        name: 'Noite das Divas',
        status: 'DRAFT',
        imageUrl: null,
        participants: [],
        rules: {
          songsPerParticipant: 2,
          scoringMode: 'pitch+audience',
          voteSeconds: 20,
          autoAdvanceSeconds: 15,
          shuffle: false,
        },
      });
      expect((await call('GET', '/api/competitions')).json().items).toHaveLength(1);
    });

    it('requires a name', async () => {
      expect((await call('POST', '/api/competitions', { name: '  ' })).statusCode).toBe(400);
    });

    it('changes the name and the rules', async () => {
      const { id } = await create();

      const response = await call('PATCH', `/api/competitions/${id}`, {
        name: 'Duelo',
        songsPerParticipant: 3,
        scoringMode: 'audience',
        voteSeconds: 15,
        autoAdvanceSeconds: 0,
        shuffle: true,
      });

      expect(response.json()).toMatchObject({
        name: 'Duelo',
        rules: {
          songsPerParticipant: 3,
          scoringMode: 'audience',
          voteSeconds: 15,
          autoAdvanceSeconds: 0,
          shuffle: true,
        },
      });
    });

    it('keeps the participants in the chosen order and drops the songs of who left', async () => {
      const { id, ana, bia, songs } = await readyCompetition();
      const carla = await profile('Carla');

      const response = await call('PUT', `/api/competitions/${id}/participants`, {
        profileIds: [carla.id, ana.id],
      });

      const { participants } = response.json();
      expect(participants.map((row: { profile: { name: string } }) => row.profile.name)).toEqual([
        'Carla',
        'Ana',
      ]);
      expect(participants[1].songs.map((entry: { song: { id: string } }) => entry.song.id)).toEqual([
        songs[0]!.id,
        songs[1]!.id,
      ]);
      expect(await prisma.competitionSong.count({ where: { profileId: bia.id } })).toBe(0);
    });

    it('limits the songs of each person to the number chosen', async () => {
      const { id, ana } = await readyCompetition();
      const extra = await createSong({ title: 'Extra' });

      const response = await call('POST', `/api/competitions/${id}/songs`, {
        profileId: ana.id,
        songId: extra.id,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error).toMatchObject({ code: 'TOO_MANY_SONGS' });
      expect(response.json().error.message).toContain('2 músicas');
    });

    it('refuses songs for someone outside the competition, repeated songs and songs that failed', async () => {
      const { id, ana, songs } = await readyCompetition();
      const outsider = await profile('Fora');
      const broken = await createSong({ title: 'Quebrada' });

      expect(
        (
          await call('POST', `/api/competitions/${id}/songs`, {
            profileId: outsider.id,
            songId: songs[0]!.id,
          })
        ).json().error.code,
      ).toBe('PARTICIPANT_NOT_FOUND');
      await call('PATCH', `/api/competitions/${id}`, { songsPerParticipant: 5 });
      expect(
        (
          await call('POST', `/api/competitions/${id}/songs`, { profileId: ana.id, songId: songs[0]!.id })
        ).json().error.code,
      ).toBe('ALREADY_IN_COMPETITION');
      await prisma.song.update({ where: { id: broken.id }, data: { status: 'ERROR' } });
      expect(
        (await call('POST', `/api/competitions/${id}/songs`, { profileId: ana.id, songId: broken.id })).json()
          .error.code,
      ).toBe('SONG_UNAVAILABLE');
    });

    it('removes a song from the list', async () => {
      const { id } = await readyCompetition();
      const before = (await call('GET', `/api/competitions/${id}`)).json();
      const entryId = before.participants[0].songs[0].id;

      const after = (await call('DELETE', `/api/competitions/${id}/songs/${entryId}`)).json();

      expect(after.participants[0].songs).toHaveLength(1);
    });

    it('tells the screens about every change', async () => {
      const { id } = await create();
      vi.mocked(emitToAll).mockClear();

      await call('PATCH', `/api/competitions/${id}`, { name: 'Outro nome' });

      expect(vi.mocked(emitToAll)).toHaveBeenCalledWith('competition:changed', { id });
    });

    it('is not available to phones', async () => {
      await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });
      expect((await app.inject({ method: 'GET', url: '/api/competitions', ...PHONE })).statusCode).toBe(401);
    });
  });

  describe('image', () => {
    beforeEach(resetStorage);

    it('accepts a photo, serves it and replaces it', async () => {
      const { id } = await create();
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
      const form = buildMultipart([
        { name: 'file', filename: 'foto.png', contentType: 'image/png', content: png },
      ]);

      const uploaded = await app.inject({ method: 'POST', url: `/api/competitions/${id}/image`, ...form });

      expect(uploaded.statusCode).toBe(200);
      expect(uploaded.json().imageUrl).toContain(`/api/competitions/${id}/image?v=`);
      const served = await call('GET', `/api/competitions/${id}/image`);
      expect(served.headers['content-type']).toBe('image/png');
      expect(served.rawPayload.equals(png)).toBe(true);
    });

    it('refuses files that are not images', async () => {
      const { id } = await create();
      const form = buildMultipart([
        { name: 'file', filename: 'nota.txt', contentType: 'text/plain', content: Buffer.from('oi') },
      ]);

      const response = await app.inject({ method: 'POST', url: `/api/competitions/${id}/image`, ...form });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('UNSUPPORTED_IMAGE');
    });

    it('uses the cover of a song from the library and can remove it', async () => {
      const { id } = await create();
      const song = await createSong({ title: 'Com capa' });
      await prisma.song.update({ where: { id: song.id }, data: { hasCover: true } });
      await fs.mkdir(songDir(song.id), { recursive: true });
      await fs.writeFile(path.join(songDir(song.id), 'capa.jpg'), Buffer.from([0xff, 0xd8, 1]));

      const withCover = await call('POST', `/api/competitions/${id}/image/from-song`, { songId: song.id });
      expect(withCover.json().imageUrl).not.toBeNull();
      expect((await call('GET', `/api/competitions/${id}/image`)).headers['content-type']).toBe('image/jpeg');

      const removed = await call('DELETE', `/api/competitions/${id}/image`);
      expect(removed.json().imageUrl).toBeNull();
      expect((await call('GET', `/api/competitions/${id}/image`)).statusCode).toBe(404);
    });
  });

  describe('starting', () => {
    it('puts the songs in the queue by rounds and hides the normal requests', async () => {
      const { id } = await readyCompetition();
      const guest = await profile('Visita');
      const other = await createSong({ title: 'Pedido normal' });
      await call('POST', '/api/sing-queue', { profileId: guest.id, songId: other.id });

      const started = await call('POST', `/api/competitions/${id}/start`);

      expect(started.json().status).toBe('RUNNING');
      const queue = (await call('GET', '/api/sing-queue')).json();
      expect(
        queue.items.map(
          (item: { profile: { name: string }; song: { title: string } }) =>
            `${item.profile.name}:${item.song.title}`,
        ),
      ).toEqual(['Ana:S1', 'Bia:S3', 'Ana:S2', 'Bia:S4']);
      expect(queue.competition).toEqual({ id, name: 'Festa da Família' });
      expect(await prisma.singRequest.count({ where: { competitionId: null } })).toBe(1);
    });

    it('needs two participants and some songs, and only one competition at a time', async () => {
      const lonely = await create('Sozinha');
      const ana = await profile('Ana');
      await call('PUT', `/api/competitions/${lonely.id}/participants`, { profileIds: [ana.id] });
      expect((await call('POST', `/api/competitions/${lonely.id}/start`)).json().error.code).toBe(
        'NOT_ENOUGH_PARTICIPANTS',
      );

      const bia = await profile('Bia');
      await call('PUT', `/api/competitions/${lonely.id}/participants`, { profileIds: [ana.id, bia.id] });
      expect((await call('POST', `/api/competitions/${lonely.id}/start`)).json().error.code).toBe('NO_SONGS');

      const { id } = await readyCompetition();
      await call('POST', `/api/competitions/${id}/start`);
      const second = await readyCompetition();
      expect((await call('POST', `/api/competitions/${second.id}/start`)).json().error.code).toBe(
        'COMPETITION_ALREADY_RUNNING',
      );
    });

    it('locks participants and songs once it started', async () => {
      const { id, ana } = await readyCompetition();
      await call('POST', `/api/competitions/${id}/start`);

      expect(
        (await call('PUT', `/api/competitions/${id}/participants`, { profileIds: [ana.id] })).json().error
          .code,
      ).toBe('COMPETITION_NOT_EDITABLE');
      expect(
        (await call('PATCH', `/api/competitions/${id}`, { songsPerParticipant: 4 })).json().error.code,
      ).toBe('COMPETITION_NOT_EDITABLE');
      expect((await call('PATCH', `/api/competitions/${id}`, { voteSeconds: 30 })).statusCode).toBe(200);
      expect((await call('DELETE', `/api/competitions/${id}`)).json().error.code).toBe('COMPETITION_RUNNING');
    });

    it('uses the queue rules of the competition while it runs', async () => {
      await prisma.setting.create({ data: { key: 'queue.autoAdvanceSeconds', value: 15 } });
      const { id } = await readyCompetition();
      await call('PATCH', `/api/competitions/${id}`, { autoAdvanceSeconds: 30 });

      expect((await call('GET', '/api/sing-queue')).json().autoAdvanceSeconds).toBe(15);
      await call('POST', `/api/competitions/${id}/start`);
      expect((await call('GET', '/api/sing-queue')).json().autoAdvanceSeconds).toBe(30);
    });
  });

  describe('singing and scoring', () => {
    async function sing(requestId: string, profileId: string, songId: string, stars: number[]) {
      const { id } = (await call('POST', '/api/performances', { profileId, songId, requestId })).json();
      const finish = (
        await call('POST', `/api/performances/${id}/finish`, {
          completed: true,
          voiceGuideUsed: false,
          pitchScore: null,
        })
      ).json();
      if ('voting' in finish) {
        for (const [index, value] of stars.entries()) {
          await call('POST', `/api/performances/${id}/votes`, {
            voterToken: `token-${requestId}-${index}`,
            stars: value,
          });
        }
        await call('POST', `/api/performances/${id}/voting/close`);
      }
      return id as string;
    }

    it('scores with the rules of the competition, ranks by average and finishes by itself at the end', async () => {
      await prisma.setting.create({ data: { key: 'scoring.mode', value: 'off' } });
      const { id, ana, bia } = await readyCompetition();
      await call('PATCH', `/api/competitions/${id}`, { scoringMode: 'audience' });
      await call('POST', `/api/competitions/${id}/start`);
      const queue = (await call('GET', '/api/sing-queue')).json().items;
      const votesBy: Record<string, number[]> = { [ana.id]: [5], [bia.id]: [3] };

      for (const request of queue) {
        await sing(request.id, request.profile.id, request.song.id, votesBy[request.profile.id]!);
      }

      const competition = (await call('GET', `/api/competitions/${id}`)).json();
      expect(competition.status).toBe('FINISHED');
      expect(
        competition.scoreboard.map(
          (row: { profile: { name: string }; avg: number; sung: number; total: number }) => [
            row.profile.name,
            row.avg,
            row.sung,
            row.total,
          ],
        ),
      ).toEqual([
        ['Ana', 100, 2, 2],
        ['Bia', 60, 2, 2],
      ]);
      expect(await prisma.performance.count({ where: { competitionId: id } })).toBe(4);
    });

    it('gives the normal requests back when it finishes', async () => {
      const { id } = await readyCompetition();
      const guest = await profile('Visita');
      const other = await createSong({ title: 'Pedido normal' });
      await call('POST', '/api/sing-queue', { profileId: guest.id, songId: other.id });
      await call('POST', `/api/competitions/${id}/start`);

      const finished = await call('POST', `/api/competitions/${id}/finish`);

      expect(finished.json().status).toBe('FINISHED');
      const queue = (await call('GET', '/api/sing-queue')).json();
      expect(queue.items.map((item: { song: { title: string } }) => item.song.title)).toEqual([
        'Pedido normal',
      ]);
      expect(queue.competition).toBeNull();
      expect(await prisma.singRequest.count({ where: { competitionId: id } })).toBe(0);
    });

    it('counts someone who left halfway, without a score', async () => {
      const { id } = await readyCompetition();
      await call('POST', `/api/competitions/${id}/start`);
      const [first] = (await call('GET', '/api/sing-queue')).json().items;
      const { id: performanceId } = (
        await call('POST', '/api/performances', {
          profileId: first.profile.id,
          songId: first.song.id,
          requestId: first.id,
        })
      ).json();

      await call('POST', `/api/performances/${performanceId}/finish`, {
        completed: false,
        voiceGuideUsed: false,
        pitchScore: null,
      });

      const row = (await call('GET', `/api/competitions/${id}`))
        .json()
        .scoreboard.find((item: { profile: { id: string } }) => item.profile.id === first.profile.id);
      expect(row).toMatchObject({ avg: null, sung: 1, total: 2 });
    });

    it('deletes a finished competition', async () => {
      const { id } = await readyCompetition();
      await call('POST', `/api/competitions/${id}/start`);
      await call('POST', `/api/competitions/${id}/finish`);

      expect((await call('DELETE', `/api/competitions/${id}`)).statusCode).toBe(204);
      expect((await call('GET', `/api/competitions/${id}`)).statusCode).toBe(404);
    });
  });
});

describe('roundRobin and rankScoreboard', () => {
  it('orders the songs by rounds, skipping who has fewer songs', () => {
    const songs = [
      { profileId: 'a', songId: '1' },
      { profileId: 'a', songId: '2' },
      { profileId: 'a', songId: '3' },
      { profileId: 'b', songId: '4' },
    ];
    expect(roundRobin(['b', 'a'], songs).map((entry) => entry.songId)).toEqual(['4', '1', '2', '3']);
  });

  it('ranks by average, breaking ties by the best score, and leaves who has no score at the end', () => {
    const row = (name: string, avg: number | null, best: number | null) => ({
      profile: { id: name, name, avatar: 'lion', isGuest: false },
      avg,
      best,
      sung: 1,
      total: 1,
    });
    expect(
      rankScoreboard([row('A', null, null), row('B', 80, 85), row('C', 80, 95), row('D', 90, 90)]).map(
        (item) => item.profile.name,
      ),
    ).toEqual(['D', 'C', 'B', 'A']);
  });
});
