import fs from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import type { LyricsDoc } from '@caraoke/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSong, fileExists, resetStorage } from '../../../test/fixtures.js';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { emitToAll } from '../../realtime.js';
import { songFile } from '../../services/storage.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn() }));

const LRCLIB_DOC: LyricsDoc = {
  version: 1,
  source: 'LRCLIB',
  synced: true,
  lines: [
    { start: 10, end: 14, text: 'Primeira' },
    { start: 14, end: 20, text: 'Segunda' },
  ],
};

const EDITED = {
  synced: true,
  lines: [
    { start: 25.5, end: 30, text: 'Primeira' },
    { start: 30, end: 36.25, text: 'Segunda' },
  ],
};

describe('lyrics routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await resetDatabase();
    await resetStorage();
    vi.mocked(emitToAll).mockClear();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const save = (id: string, payload: unknown) =>
    app.inject({ method: 'PUT', url: `/api/songs/${id}/lyrics`, payload: payload as object });
  const original = (id: string) => app.inject({ method: 'GET', url: `/api/songs/${id}/lyrics/original` });
  const restore = (id: string) => app.inject({ method: 'POST', url: `/api/songs/${id}/lyrics/restore` });

  async function songWithLyrics(doc: LyricsDoc = LRCLIB_DOC, overrides: Record<string, unknown> = {}) {
    const song = await createSong({ lyricsSource: doc.source, lyricsOffsetMs: 15750, ...overrides });
    await fs.mkdir(songFile(song.id, '.'), { recursive: true });
    await fs.writeFile(songFile(song.id, 'letra.json'), JSON.stringify(doc));
    return song;
  }

  const readDoc = async (id: string, file = 'letra.json') =>
    JSON.parse(await fs.readFile(songFile(id, file), 'utf-8')) as LyricsDoc;

  describe('saving', () => {
    it('writes the edited lyrics as manual, resets the offset and tells everybody', async () => {
      const song = await songWithLyrics();

      const response = await save(song.id, EDITED);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ id: song.id, lyricsSource: 'MANUAL', lyricsOffsetMs: 0 });
      const stored = await readDoc(song.id);
      expect(stored).toMatchObject({ version: 1, source: 'MANUAL', synced: true, lines: EDITED.lines });
      expect(await fs.readFile(songFile(song.id, 'letra.lrc'), 'utf-8')).toBe(
        '[00:25.50]Primeira\n[00:30.00]Segunda',
      );
      expect(await prisma.song.findUniqueOrThrow({ where: { id: song.id } })).toMatchObject({
        lyricsSource: 'MANUAL',
        lyricsNeedsReview: false,
        lyricsOffsetMs: 0,
      });
      expect(vi.mocked(emitToAll).mock.calls.map(([event]) => event)).toEqual(['song:updated']);
    });

    it('keeps the lyrics as they were on the first save, and never overwrites that copy', async () => {
      const song = await songWithLyrics();

      await save(song.id, EDITED);
      await save(song.id, { ...EDITED, lines: [{ start: 1, end: 2, text: 'Outra' }] });

      expect(await readDoc(song.id, 'letra.original.json')).toEqual(LRCLIB_DOC);
    });

    it('changes the address of the lyrics so that screens load the new ones', async () => {
      const song = await songWithLyrics();
      const before = (await app.inject({ method: 'GET', url: `/api/songs/${song.id}` })).json().lyricsUrl;
      await new Promise((resolve) => setTimeout(resolve, 15));

      const after = (await save(song.id, EDITED)).json().lyricsUrl;

      expect(after).not.toBe(before);
    });

    it('accepts lyrics without times, and removes the old time file', async () => {
      const song = await songWithLyrics();
      await fs.writeFile(songFile(song.id, 'letra.lrc'), '[00:10.00]Primeira');

      const response = await save(song.id, {
        synced: false,
        lines: [{ start: 0, end: 0, text: 'Só texto' }],
      });

      expect(response.statusCode).toBe(200);
      expect((await readDoc(song.id)).synced).toBe(false);
      expect(await fileExists(songFile(song.id, 'letra.lrc'))).toBe(false);
    });

    it('keeps the words of each line when they come', async () => {
      const song = await songWithLyrics();
      const words = [{ start: 25.5, end: 26, text: 'Primeira' }];

      await save(song.id, { synced: true, lines: [{ start: 25.5, end: 30, text: 'Primeira', words }] });

      expect((await readDoc(song.id)).lines[0]?.words).toEqual(words);
    });

    it('creates the lyrics of a song that had none', async () => {
      const song = await createSong({ lyricsSource: 'NONE' });
      await fs.mkdir(songFile(song.id, '.'), { recursive: true });

      expect((await save(song.id, EDITED)).statusCode).toBe(200);

      expect(await fileExists(songFile(song.id, 'letra.original.json'))).toBe(false);
      expect((await readDoc(song.id)).lines).toHaveLength(2);
    });

    it('trims the text of the lines', async () => {
      const song = await songWithLyrics();
      await save(song.id, { synced: true, lines: [{ start: 1, end: 2, text: '  Oi  ' }] });
      expect((await readDoc(song.id)).lines[0]?.text).toBe('Oi');
    });

    it.each([
      ['no lines', { synced: true, lines: [] }],
      ['a line without text', { synced: true, lines: [{ start: 1, end: 2, text: '   ' }] }],
      ['a line that ends before it starts', { synced: true, lines: [{ start: 5, end: 2, text: 'x' }] }],
      ['a negative time', { synced: true, lines: [{ start: -1, end: 2, text: 'x' }] }],
      [
        'synced lines out of order',
        {
          synced: true,
          lines: [
            { start: 9, end: 10, text: 'a' },
            { start: 2, end: 3, text: 'b' },
          ],
        },
      ],
      ['a missing synced flag', { lines: [{ start: 1, end: 2, text: 'x' }] }],
      [
        'a word that ends before it starts',
        { synced: true, lines: [{ start: 1, end: 5, text: 'x', words: [{ start: 3, end: 2, text: 'x' }] }] },
      ],
      ['text that is too long', { synced: true, lines: [{ start: 1, end: 2, text: 'x'.repeat(501) }] }],
    ])('refuses %s and changes nothing', async (_name, payload) => {
      const song = await songWithLyrics();

      const response = await save(song.id, payload);

      expect(response.statusCode).toBe(400);
      expect(await readDoc(song.id)).toEqual(LRCLIB_DOC);
      expect(await fileExists(songFile(song.id, 'letra.original.json'))).toBe(false);
    });

    it('allows unsorted lines when the lyrics have no times', async () => {
      const song = await songWithLyrics();
      const lines = [
        { start: 0, end: 0, text: 'a' },
        { start: 0, end: 0, text: 'b' },
      ];
      expect((await save(song.id, { synced: false, lines })).statusCode).toBe(200);
    });

    it('answers 404 for a song that does not exist', async () => {
      const response = await save('nobody', EDITED);
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('SONG_NOT_FOUND');
    });
  });

  describe('the original lyrics', () => {
    it('says there is none before anything was edited', async () => {
      const song = await songWithLyrics();

      const response = await original(song.id);

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NO_ORIGINAL_LYRICS');
    });

    it('returns the original after the lyrics were edited', async () => {
      const song = await songWithLyrics();
      await save(song.id, EDITED);

      const response = await original(song.id);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(LRCLIB_DOC);
    });

    it('restores the original, with its source, and resets the offset', async () => {
      const song = await songWithLyrics();
      await save(song.id, EDITED);

      const response = await restore(song.id);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ lyricsSource: 'LRCLIB', lyricsOffsetMs: 0 });
      expect(await readDoc(song.id)).toEqual(LRCLIB_DOC);
      expect(await fs.readFile(songFile(song.id, 'letra.lrc'), 'utf-8')).toBe(
        '[00:10.00]Primeira\n[00:14.00]Segunda',
      );
      expect(vi.mocked(emitToAll).mock.calls.map(([event]) => event)).toEqual([
        'song:updated',
        'song:updated',
      ]);
    });

    it('can edit again after restoring, keeping the same original', async () => {
      const song = await songWithLyrics();
      await save(song.id, EDITED);
      await restore(song.id);
      await save(song.id, { synced: true, lines: [{ start: 3, end: 4, text: 'De novo' }] });

      expect((await original(song.id)).json()).toEqual(LRCLIB_DOC);
    });

    it('refuses to restore when there is no original, and when the song does not exist', async () => {
      const song = await songWithLyrics();

      expect((await restore(song.id)).statusCode).toBe(404);
      expect((await restore('nobody')).json().error.code).toBe('SONG_NOT_FOUND');
      expect((await original('nobody')).statusCode).toBe(404);
    });
  });

  it('is not available to phones', async () => {
    await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });
    const song = await songWithLyrics();

    const response = await app.inject({
      method: 'PUT',
      url: `/api/songs/${song.id}/lyrics`,
      payload: EDITED,
      remoteAddress: '192.168.0.50',
      headers: { 'x-access-code': 'ABC234' },
    });

    expect(response.statusCode).toBe(401);
  });
});
