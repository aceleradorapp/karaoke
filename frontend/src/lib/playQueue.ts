import type { SongDTO } from '@caraoke/shared';

const MULBERRY_INCREMENT = 0x6d2b79f5;

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + MULBERRY_INCREMENT) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const random = seededRandom(seed);
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other] as T, result[index] as T];
  }
  return result;
}

export function buildPlayQueue(songs: readonly SongDTO[], shuffleSeed: number | null): SongDTO[] {
  const ready = songs.filter((song) => song.status === 'READY');
  return shuffleSeed === null ? ready : shuffleWithSeed(ready, shuffleSeed);
}

export function newShuffleSeed(): number {
  return Math.floor(Math.random() * 2 ** 31) + 1;
}

export interface QueueStep {
  song: SongDTO;
  index: number;
  total: number;
  next: SongDTO | null;
}

export function locateInQueue(queue: readonly SongDTO[], songId: string): QueueStep | null {
  const index = queue.findIndex((song) => song.id === songId);
  if (index === -1) return null;
  return { song: queue[index] as SongDTO, index, total: queue.length, next: queue[index + 1] ?? null };
}

export function playerRoute(songId: string, playlistId: string, shuffleSeed: number | null): string {
  const params = new URLSearchParams({ playlist: playlistId });
  if (shuffleSeed !== null) params.set('shuffle', String(shuffleSeed));
  return `/player/${songId}?${params.toString()}`;
}

export function parseShuffleSeed(value: string | null): number | null {
  if (value === null) return null;
  const seed = Number(value);
  return Number.isInteger(seed) && seed > 0 ? seed : null;
}
