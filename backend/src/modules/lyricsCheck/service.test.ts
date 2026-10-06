import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import {
  checkLyrics,
  clearLyricsCheckCache,
  findLyricsAvailability,
  LrclibUnreachableError,
  pickBest,
  type LrclibEntry,
  type LrclibFetch,
} from './service.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn() }));

const SYNCED: LrclibEntry = { syncedLyrics: '[00:01.00] Oi', plainLyrics: 'Oi', duration: 200 };
const PLAIN: LrclibEntry = { syncedLyrics: null, plainLyrics: 'Oi', duration: 200 };

function fakeLrclib(answers: Record<string, LrclibEntry | LrclibEntry[] | null>) {
  const calls: Array<{ path: string; params: Record<string, string> }> = [];
  const fetcher: LrclibFetch = async (path, params) => {
    calls.push({ path, params });
    const key = `${path} ${params.q ?? `${params.artist_name}/${params.track_name}`}`;
    return answers[key] ?? (path === '/get' ? null : []);
  };
  return { fetcher, calls };
}

describe('pickBest', () => {
  it('prefers synced lyrics among the results close to the duration', () => {
    expect(pickBest([PLAIN, SYNCED], 202)).toBe('SYNCED');
    expect(pickBest([{ ...SYNCED, duration: 260 }, PLAIN], 200)).toBe('PLAIN');
    expect(pickBest([{ instrumental: true, duration: 200 }], 200)).toBe('INSTRUMENTAL');
    expect(pickBest([{ ...SYNCED, duration: 260 }], 200)).toBeNull();
  });
});

describe('findLyricsAvailability', () => {
  it('finds the exact match first, with the duration', async () => {
    const { fetcher, calls } = fakeLrclib({ '/get Titãs/Flores': SYNCED });

    expect(await findLyricsAvailability({ artist: 'Titãs', title: 'Flores', durationSec: 208 }, fetcher)).toBe('SYNCED');
    expect(calls).toEqual([
      { path: '/get', params: { artist_name: 'Titãs', track_name: 'Flores', duration: '208' } },
    ]);
  });

  it('then searches by title and artist, then freely', async () => {
    const { fetcher, calls } = fakeLrclib({ '/search Titãs Flores': [PLAIN] });

    expect(await findLyricsAvailability({ artist: 'Titãs', title: 'Flores' }, fetcher)).toBe('PLAIN');
    expect(calls.map((call) => call.path)).toEqual(['/get', '/search', '/search']);
  });

  it('tries with artist and title swapped before giving up', async () => {
    const { fetcher, calls } = fakeLrclib({ '/get Flores/Titãs': SYNCED });

    expect(await findLyricsAvailability({ artist: 'Titãs', title: 'Flores' }, fetcher)).toBe('SYNCED');
    expect(calls).toHaveLength(4);
  });

  it('says there are no lyrics after every attempt', async () => {
    const { fetcher, calls } = fakeLrclib({});
    expect(await findLyricsAvailability({ artist: 'Ninguém', title: 'Nada' }, fetcher)).toBe('NONE');
    expect(calls).toHaveLength(6);
  });

  it('says it does not know when the site does not answer', async () => {
    const fetcher: LrclibFetch = async () => {
      throw new LrclibUnreachableError('offline');
    };
    expect(await findLyricsAvailability({ artist: 'Titãs', title: 'Flores' }, fetcher)).toBe('UNKNOWN');
  });
});

describe('checkLyrics', () => {
  beforeEach(() => clearLyricsCheckCache());

  it('remembers the answer for the same song', async () => {
    const { fetcher, calls } = fakeLrclib({ '/get Titãs/Flores': SYNCED });

    await checkLyrics({ artist: 'Titãs', title: 'Flores' }, fetcher);
    expect(await checkLyrics({ artist: 'titãs ', title: 'FLORES' }, fetcher)).toBe('SYNCED');
    expect(calls).toHaveLength(1);
  });

  it('asks again after six hours', async () => {
    const { fetcher, calls } = fakeLrclib({ '/get Titãs/Flores': SYNCED });
    let now = 0;

    await checkLyrics({ artist: 'Titãs', title: 'Flores' }, fetcher, () => now);
    now = 6 * 60 * 60 * 1000 + 1;
    await checkLyrics({ artist: 'Titãs', title: 'Flores' }, fetcher, () => now);

    expect(calls).toHaveLength(2);
  });

  it('does not remember when the site did not answer', async () => {
    let isOnline = false;
    const fetcher: LrclibFetch = async () => {
      if (!isOnline) throw new LrclibUnreachableError('offline');
      return SYNCED;
    };

    expect(await checkLyrics({ artist: 'A', title: 'B' }, fetcher)).toBe('UNKNOWN');
    isOnline = true;
    expect(await checkLyrics({ artist: 'A', title: 'B' }, fetcher)).toBe('SYNCED');
  });

  it('checks at most four songs at the same time', async () => {
    let active = 0;
    let peak = 0;
    const fetcher: LrclibFetch = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return SYNCED;
    };

    await Promise.all(
      Array.from({ length: 8 }, (_, index) => checkLyrics({ artist: 'A', title: `Música ${index}` }, fetcher)),
    );

    expect(peak).toBe(4);
  });
});

describe('GET /api/lyrics/check', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
  });

  beforeEach(() => {
    clearLyricsCheckCache();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });

  it('answers with what LRCLIB has for the song', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const isExact = url.includes('/get?');
      return new Response(JSON.stringify(isExact ? SYNCED : []), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await app.inject({
      method: 'GET',
      url: '/api/lyrics/check?artist=Tit%C3%A3s&title=Flores&duration=208',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'SYNCED' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://lrclib.net/api/get?artist_name=Tit%C3%A3s&track_name=Flores&duration=208');
    expect(new Headers(init.headers).get('User-Agent')).toContain('caraoke-michael');
  });

  it('tries once more when LRCLIB fails for a moment', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        return calls === 1 ? new Response('erro', { status: 503 }) : new Response(JSON.stringify(SYNCED));
      }),
    );
    const response = await app.inject({ method: 'GET', url: '/api/lyrics/check?artist=A&title=B' });
    expect(response.json()).toEqual({ status: 'SYNCED' });
    expect(calls).toBe(2);
  });

  it('answers UNKNOWN when LRCLIB is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('erro', { status: 503 })));
    const response = await app.inject({ method: 'GET', url: '/api/lyrics/check?artist=A&title=B' });
    expect(response.json()).toEqual({ status: 'UNKNOWN' });
  });

  it('requires a title', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/lyrics/check?artist=A' })).statusCode).toBe(400);
  });
});
