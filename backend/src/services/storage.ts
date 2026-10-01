import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../env.js';

const SAFE_FILENAME_MAX_LENGTH = 120;

export const storagePaths = {
  root: env.STORAGE_DIR,
  uploadDir: path.join(env.STORAGE_DIR, 'entrada', 'upload'),
  youtubeDir: path.join(env.STORAGE_DIR, 'entrada', 'youtube'),
  libraryDir: path.join(env.STORAGE_DIR, 'biblioteca'),
  errorDir: path.join(env.STORAGE_DIR, 'erro'),
  tmpDir: path.join(env.STORAGE_DIR, 'tmp'),
};

export async function ensureDirs(): Promise<void> {
  const dirs = [
    storagePaths.uploadDir,
    storagePaths.youtubeDir,
    storagePaths.libraryDir,
    storagePaths.errorDir,
    storagePaths.tmpDir,
  ];
  await Promise.all(dirs.map((dir) => fs.mkdir(dir, { recursive: true })));
}

export function resolveInside(baseDir: string, ...segments: string[]): string {
  const resolved = path.resolve(baseDir, ...segments);
  const relative = path.relative(baseDir, resolved);
  const escapesBase = relative.startsWith('..') || path.isAbsolute(relative);
  if (escapesBase) {
    throw new Error('Path escapes the storage directory');
  }
  return resolved;
}

export function songDir(songId: string): string {
  return resolveInside(storagePaths.libraryDir, songId);
}

export function songFile(songId: string, filename: string): string {
  return resolveInside(songDir(songId), filename);
}

export async function deleteSongDir(songId: string): Promise<void> {
  await fs.rm(songDir(songId), { recursive: true, force: true });
}

export async function moveToError(filePath: string): Promise<string | null> {
  if (!filePath || !isInsideStorage(filePath)) return null;

  const source = path.resolve(filePath);
  const isFile = await fs.stat(source).then(
    (stats) => stats.isFile(),
    () => false,
  );
  if (!isFile) return null;
  const target = path.join(storagePaths.errorDir, `${Date.now()}-${path.basename(source)}`);
  await fs.rename(source, target);
  return target;
}

export function safeFilename(name: string): string {
  const parsed = path.parse(name);
  const base = parsed.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SAFE_FILENAME_MAX_LENGTH);
  const extension = parsed.ext.toLowerCase().replace(/[^a-z0-9.]/g, '');
  return `${base || 'file'}${extension}`;
}

async function directorySize(dir: string): Promise<number> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return directorySize(entryPath);
      const stats = await fs.stat(entryPath).catch(() => null);
      return stats?.size ?? 0;
    }),
  );
  return sizes.reduce((total, size) => total + size, 0);
}

export async function diskUsage(): Promise<{ usedBytes: number }> {
  return { usedBytes: await directorySize(storagePaths.libraryDir) };
}

export function isInsideStorage(filePath: string): boolean {
  const relative = path.relative(storagePaths.root, path.resolve(filePath));
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

export async function deleteOriginFile(filePath: string | null): Promise<void> {
  if (!filePath || !isInsideStorage(filePath)) return;
  await fs.rm(filePath, { force: true });
}
