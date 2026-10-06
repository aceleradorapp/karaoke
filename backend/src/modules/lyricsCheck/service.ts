import type { LyricsAvailability } from '@caraoke/shared';

export interface LrclibEntry {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  instrumental?: boolean | null;
  duration?: number | null;
}

export type LrclibResult = LrclibEntry | LrclibEntry[] | null;
export type LrclibFetch = (path: string, params: Record<string, string>) => Promise<LrclibResult>;

export interface LyricsQuery {
  artist: string;
  title: string;
  durationSec?: number;
}

const LRCLIB_BASE_URL = 'https://lrclib.net/api';
const USER_AGENT = process.env.LRCLIB_USER_AGENT ?? 'caraoke-michael/0.1 (personal use)';
const REQUEST_TIMEOUT_MS = 15_000;
const DURATION_TOLERANCE_SECONDS = 5;
const NOT_FOUND = 404;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_LIMIT = 1000;
const MAX_CONCURRENT_CHECKS = 4;
const RETRY_DELAYS_MS = [300, 600, 1000];

export class LrclibUnreachableError extends Error {}

async function requestOnce(url: string): Promise<LrclibResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new LrclibUnreachableError(error instanceof Error ? error.message : 'LRCLIB não respondeu');
  }
  if (response.status === NOT_FOUND) return null;
  if (!response.ok) throw new LrclibUnreachableError(`LRCLIB respondeu ${response.status}`);
  return (await response.json()) as LrclibResult;
}

export async function fetchLrclib(path: string, params: Record<string, string>): Promise<LrclibResult> {
  const url = `${LRCLIB_BASE_URL}${path}?${new URLSearchParams(params)}`;
  for (const delayMs of RETRY_DELAYS_MS) {
    try {
      return await requestOnce(url);
    } catch (error) {
      if (!(error instanceof LrclibUnreachableError)) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return requestOnce(url);
}

function availabilityOf(entry: LrclibEntry): LyricsAvailability | null {
  if (entry.syncedLyrics) return 'SYNCED';
  if (entry.instrumental) return 'INSTRUMENTAL';
  if (entry.plainLyrics) return 'PLAIN';
  return null;
}

function isCloseEnough(entry: LrclibEntry, durationSec: number | undefined): boolean {
  if (durationSec === undefined || entry.duration == null) return true;
  return Math.abs(entry.duration - durationSec) <= DURATION_TOLERANCE_SECONDS;
}

function asList(result: LrclibResult): LrclibEntry[] {
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

export function pickBest(entries: LrclibEntry[], durationSec?: number): LyricsAvailability | null {
  const close = entries.filter((entry) => isCloseEnough(entry, durationSec));
  if (close.some((entry) => entry.syncedLyrics)) return 'SYNCED';
  const fallback = close.find((entry) => entry.plainLyrics || entry.instrumental);
  return fallback ? availabilityOf(fallback) : null;
}

async function findInOrder(
  fetcher: LrclibFetch,
  artist: string,
  title: string,
  durationSec?: number,
): Promise<LyricsAvailability | null> {
  const exactParams: Record<string, string> = { artist_name: artist, track_name: title };
  if (durationSec) exactParams.duration = String(durationSec);

  const attempts = [
    async () => {
      const entry = await fetcher('/get', exactParams);
      return entry && !Array.isArray(entry) ? availabilityOf(entry) : null;
    },
    async () => pickBest(asList(await fetcher('/search', { track_name: title, artist_name: artist })), durationSec),
    async () => pickBest(asList(await fetcher('/search', { q: `${artist} ${title}`.trim() })), durationSec),
  ];
  for (const attempt of attempts) {
    const found = await attempt();
    if (found) return found;
  }
  return null;
}

export async function findLyricsAvailability(
  query: LyricsQuery,
  fetcher: LrclibFetch = fetchLrclib,
): Promise<LyricsAvailability> {
  const artist = query.artist.trim();
  const title = query.title.trim();
  try {
    const found = await findInOrder(fetcher, artist, title, query.durationSec);
    if (found || !artist) return found ?? 'NONE';
    return (await findInOrder(fetcher, title, artist, query.durationSec)) ?? 'NONE';
  } catch (error) {
    if (error instanceof LrclibUnreachableError) return 'UNKNOWN';
    throw error;
  }
}

const cache = new Map<string, { availability: LyricsAvailability; expiresAt: number }>();
const waiting: Array<() => void> = [];
let running = 0;

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  while (running >= MAX_CONCURRENT_CHECKS) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await task();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

function cacheKey(query: LyricsQuery): string {
  return [query.artist.trim(), query.title.trim(), query.durationSec ?? ''].join('|').toLowerCase();
}

function remember(key: string, availability: LyricsAvailability, expiresAt: number): void {
  cache.delete(key);
  cache.set(key, { availability, expiresAt });
  if (cache.size <= CACHE_LIMIT) return;
  const oldest = cache.keys().next().value;
  if (oldest !== undefined) cache.delete(oldest);
}

export async function checkLyrics(
  query: LyricsQuery,
  fetcher: LrclibFetch = fetchLrclib,
  now: () => number = Date.now,
): Promise<LyricsAvailability> {
  const key = cacheKey(query);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now()) return cached.availability;

  const availability = await withSlot(() => findLyricsAvailability(query, fetcher));
  if (availability !== 'UNKNOWN') remember(key, availability, now() + CACHE_TTL_MS);
  return availability;
}

export function clearLyricsCheckCache(): void {
  cache.clear();
}
