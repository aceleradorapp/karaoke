import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabase } from '../../../test/database.js';
import { buildApp } from '../../app.js';
import { prisma } from '../../db.js';
import { AppError } from '../../utils/errors.js';
import { searchYoutubeEntries } from '../../services/ytdlp.js';
import { clearYoutubeSearchCache } from './service.js';

vi.mock('../../services/ytdlp.js', () => ({ searchYoutubeEntries: vi.fn() }));

const searchMock = vi.mocked(searchYoutubeEntries);

const ENTRIES = [
  {
    id: 'abc123',
    title: 'Chitãozinho & Xororó - Evidências (Karaoke Version)',
    channel: 'Karaoke Brasil',
    duration: 298.4,
  },
  { id: 'long01', title: 'Mix de 2 horas', channel: 'Canal', duration: 7200 },
  { id: 'live01', title: 'Ao vivo agora', channel: 'Canal', duration: 100, live_status: 'is_live' },
  { id: 'nodur1', title: 'Sem duração', channel: 'Canal', duration: null },
  { id: 'upl001', title: 'Hello', uploader: 'AdeleVEVO', duration: 200 },
];

describe('youtube search route', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(async () => {
    await resetDatabase();
    clearYoutubeSearchCache();
    searchMock.mockReset();
    searchMock.mockResolvedValue(ENTRIES);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const search = (query: string) => app.inject({ method: 'GET', url: `/api/youtube/search?${query}` });

  it('maps results and drops long videos, live streams and entries without duration', async () => {
    const response = await search('q=evidencias');

    expect(response.statusCode).toBe(200);
    const items = response.json().items;
    expect(items.map((item: { youtubeId: string }) => item.youtubeId)).toEqual(['abc123', 'upl001']);
    expect(items[0]).toMatchObject({
      youtubeId: 'abc123',
      durationSec: 298,
      thumbnailUrl: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
      suggested: { artist: 'Chitãozinho & Xororó', title: 'Evidências' },
      existingSongId: null,
    });
  });

  it('falls back to the uploader when there is no channel', async () => {
    const items = (await search('q=hello')).json().items;
    expect(items[1]).toMatchObject({ channel: 'AdeleVEVO', suggested: { artist: 'Adele', title: 'Hello' } });
  });

  it('flags videos that are already in the library', async () => {
    const song = await prisma.song.create({
      data: { title: 'Evidências', artist: 'X', source: 'YOUTUBE', youtubeId: 'abc123' },
    });

    const items = (await search('q=evidencias')).json().items;

    expect(items[0].existingSongId).toBe(song.id);
    expect(items[1].existingSongId).toBeNull();
  });

  it('reuses the cached result for the same query but still refreshes the library flag', async () => {
    await search('q=Evidencias');
    const song = await prisma.song.create({
      data: { title: 'E', artist: 'X', source: 'YOUTUBE', youtubeId: 'abc123' },
    });

    const second = await search('q=evidencias');

    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(second.json().items[0].existingSongId).toBe(song.id);
  });

  it('does not share the cache between different queries or limits', async () => {
    await search('q=a');
    await search('q=b');
    await search('q=a&limit=5');
    expect(searchMock).toHaveBeenCalledTimes(3);
    expect(searchMock).toHaveBeenLastCalledWith('a', 5);
  });

  it('validates the query string', async () => {
    for (const query of ['', 'q=', 'q=%20%20', `q=${'x'.repeat(101)}`, 'q=a&limit=0', 'q=a&limit=99']) {
      const response = await search(query);
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    }
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('answers 502 with a helpful message when yt-dlp fails', async () => {
    searchMock.mockRejectedValue(
      new AppError(
        'YOUTUBE_SEARCH_FAILED',
        'Falha na busca do YouTube. Tente atualizar o yt-dlp nas configurações.',
        502,
      ),
    );

    const response = await search('q=evidencias');

    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe('YOUTUBE_SEARCH_FAILED');
  });

  it('is available to phones that have the access code', async () => {
    await prisma.setting.create({ data: { key: 'access.code', value: 'ABC234' } });

    const response = await app.inject({
      method: 'GET',
      url: '/api/youtube/search?q=hello',
      remoteAddress: '192.168.0.50',
      headers: { 'x-access-code': 'ABC234' },
    });

    expect(response.statusCode).toBe(200);
  });
});
