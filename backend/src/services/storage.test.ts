import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { fileExists, listDirectory, resetStorage } from '../../test/fixtures.js';
import {
  deleteOriginFile,
  isInsideStorage,
  moveToError,
  resolveInside,
  safeFilename,
  songDir,
  storagePaths,
} from './storage.js';

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

describe('origin file handling', () => {
  beforeEach(resetStorage);

  async function createFileIn(dir: string, name = 'song.mp3'): Promise<string> {
    const filePath = path.join(dir, name);
    await fs.writeFile(filePath, 'audio');
    return filePath;
  }

  it('recognizes only paths inside the storage folder', () => {
    expect(isInsideStorage(path.join(storagePaths.uploadDir, 'a.mp3'))).toBe(true);
    expect(isInsideStorage(path.join(storagePaths.root, '..', 'elsewhere.mp3'))).toBe(false);
    expect(isInsideStorage('')).toBe(false);
  });

  it('moves a file to the error folder with a timestamp prefix', async () => {
    const source = await createFileIn(storagePaths.uploadDir);

    const target = await moveToError(source);

    expect(target).not.toBeNull();
    expect(path.dirname(target as string)).toBe(storagePaths.errorDir);
    expect(path.basename(target as string)).toMatch(/^\d+-song\.mp3$/);
    expect(await fileExists(source)).toBe(false);
    expect(await fileExists(target as string)).toBe(true);
  });

  it('never moves directories, missing files, empty paths or files outside the storage folder', async () => {
    const outside = `${storagePaths.root}-outside.txt`;
    await fs.writeFile(outside, 'keep me');

    expect(await moveToError('')).toBeNull();
    expect(await moveToError(storagePaths.uploadDir)).toBeNull();
    expect(await moveToError(path.join(storagePaths.uploadDir, 'missing.mp3'))).toBeNull();
    expect(await moveToError(outside)).toBeNull();

    expect(await fileExists(outside)).toBe(true);
    expect(await fileExists(storagePaths.uploadDir)).toBe(true);
    expect(await listDirectory(storagePaths.errorDir)).toEqual([]);
    await fs.rm(outside, { force: true });
  });

  it('deletes origin files only inside the storage folder', async () => {
    const inside = await createFileIn(storagePaths.uploadDir);
    const outside = `${storagePaths.root}-outside.txt`;
    await fs.writeFile(outside, 'keep me');

    await deleteOriginFile(inside);
    await deleteOriginFile(outside);
    await deleteOriginFile(null);

    expect(await fileExists(inside)).toBe(false);
    expect(await fileExists(outside)).toBe(true);
    await fs.rm(outside, { force: true });
  });
});
