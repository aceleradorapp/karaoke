import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveInside, safeFilename, songDir } from './storage.js';

describe('safeFilename', () => {
  it('removes accents and unsafe characters', () => {
    expect(safeFilename('Música Nº 1 (ao vivo).MP3')).toBe('Musica-N-1-ao-vivo.mp3');
  });

  it('falls back to a default name', () => {
    expect(safeFilename('???.wav')).toBe('file.wav');
  });
});

describe('resolveInside', () => {
  const base = path.resolve('some', 'base');

  it('resolves paths inside the base directory', () => {
    expect(resolveInside(base, 'a', 'b.txt')).toBe(path.join(base, 'a', 'b.txt'));
  });

  it('rejects path traversal', () => {
    expect(() => resolveInside(base, '..', 'outside.txt')).toThrow();
    expect(() => songDir('../../etc')).toThrow();
  });
});
