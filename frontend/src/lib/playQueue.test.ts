import { describe, expect, it } from 'vitest';
import { buildSong } from '../test/songBuilder';
import {
  buildPlayQueue,
  locateInQueue,
  newShuffleSeed,
  parseShuffleSeed,
  playerRoute,
  shuffleWithSeed,
} from './playQueue';

const NUMBERS = Array.from({ length: 30 }, (_, index) => index);

describe('shuffleWithSeed', () => {
  it('keeps every item exactly once', () => {
    expect([...shuffleWithSeed(NUMBERS, 7)].sort((a, b) => a - b)).toEqual(NUMBERS);
  });

  it('gives the same order for the same seed and another order for another seed', () => {
    expect(shuffleWithSeed(NUMBERS, 7)).toEqual(shuffleWithSeed(NUMBERS, 7));
    expect(shuffleWithSeed(NUMBERS, 7)).not.toEqual(shuffleWithSeed(NUMBERS, 8));
  });

  it('really mixes the items', () => {
    expect(shuffleWithSeed(NUMBERS, 123)).not.toEqual(NUMBERS);
  });

  it('does not change the original list and handles tiny lists', () => {
    const original = [1, 2, 3];
    shuffleWithSeed(original, 5);
    expect(original).toEqual([1, 2, 3]);
    expect(shuffleWithSeed([], 5)).toEqual([]);
    expect(shuffleWithSeed(['only'], 5)).toEqual(['only']);
  });
});

describe('buildPlayQueue', () => {
  const ready = [buildSong({ id: 'a' }), buildSong({ id: 'b' }), buildSong({ id: 'c' })];
  const broken = buildSong({ id: 'x', status: 'ERROR' });
  const processing = buildSong({ id: 'y', status: 'PROCESSING' });

  it('keeps the playlist order and skips the songs that cannot be sung', () => {
    const queue = buildPlayQueue([ready[0]!, broken, ready[1]!, processing, ready[2]!], null);
    expect(queue.map((song) => song.id)).toEqual(['a', 'b', 'c']);
  });

  it('shuffles only the songs that can be sung, the same way every time for a seed', () => {
    const first = buildPlayQueue([...ready, broken], 99).map((song) => song.id);
    const again = buildPlayQueue([...ready, broken], 99).map((song) => song.id);
    expect(first).toEqual(again);
    expect([...first].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('locateInQueue', () => {
  const queue = [buildSong({ id: 'a' }), buildSong({ id: 'b' }), buildSong({ id: 'c' })];

  it('tells the position, the size and the next song', () => {
    const step = locateInQueue(queue, 'b');
    expect(step).toMatchObject({ index: 1, total: 3 });
    expect(step?.next?.id).toBe('c');
  });

  it('has no next song at the end and no step for a stranger', () => {
    expect(locateInQueue(queue, 'c')?.next).toBeNull();
    expect(locateInQueue(queue, 'zzz')).toBeNull();
  });
});

describe('player routes', () => {
  it('builds the address with the playlist and, when shuffled, the seed', () => {
    expect(playerRoute('s1', 'pl1', null)).toBe('/player/s1?playlist=pl1');
    expect(playerRoute('s1', 'pl1', 42)).toBe('/player/s1?playlist=pl1&shuffle=42');
  });

  it('reads a valid seed and ignores garbage', () => {
    expect(parseShuffleSeed('42')).toBe(42);
    for (const value of [null, '', 'abc', '-3', '0', '1.5']) expect(parseShuffleSeed(value)).toBeNull();
  });

  it('creates positive integer seeds', () => {
    const seed = newShuffleSeed();
    expect(Number.isInteger(seed) && seed > 0).toBe(true);
  });
});
