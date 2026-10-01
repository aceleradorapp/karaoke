import { MAX_VIDEO_DURATION_SECONDS, parseYoutubeTitle, type YoutubeSearchResult } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { searchYoutubeEntries, type YtdlpSearchEntry } from '../../services/ytdlp.js';

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 50;
const LIVE_STATUSES = new Set(['is_live', 'is_upcoming']);

type YoutubeSearchItem = Omit<YoutubeSearchResult, 'existingSongId'>;

interface CacheEntry {
  expiresAt: number;
  items: YoutubeSearchItem[];
}

const cache = new Map<string, CacheEntry>();

export function clearYoutubeSearchCache(): void {
  cache.clear();
}

function toSearchItem(entry: YtdlpSearchEntry): YoutubeSearchItem | null {
  const { id, title, duration } = entry;
  if (!id || !title || !duration) return null;
  if (duration > MAX_VIDEO_DURATION_SECONDS) return null;
  if (entry.live_status && LIVE_STATUSES.has(entry.live_status)) return null;

  const channel = entry.channel ?? entry.uploader ?? '';
  return {
    youtubeId: id,
    title,
    channel,
    durationSec: Math.round(duration),
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    suggested: parseYoutubeTitle(title, channel),
  };
}

function rememberInCache(key: string, items: YoutubeSearchItem[], now: number): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, items });
}

async function searchItems(query: string, limit: number, now: number): Promise<YoutubeSearchItem[]> {
  const key = `${limit}:${query.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.items;

  const entries = await searchYoutubeEntries(query, limit);
  const items = entries.map(toSearchItem).filter((item): item is YoutubeSearchItem => item !== null);
  rememberInCache(key, items, now);
  return items;
}

export async function searchVideos(
  query: string,
  limit: number,
  now: number = Date.now(),
): Promise<YoutubeSearchResult[]> {
  const items = await searchItems(query.trim(), limit, now);
  const existing = await prisma.song.findMany({
    where: { youtubeId: { in: items.map((item) => item.youtubeId) } },
    select: { id: true, youtubeId: true },
  });
  const songIdByYoutubeId = new Map(existing.map((song) => [song.youtubeId, song.id]));

  return items.map((item) => ({ ...item, existingSongId: songIdByYoutubeId.get(item.youtubeId) ?? null }));
}
