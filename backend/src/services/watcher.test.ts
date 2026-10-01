import fs from 'node:fs/promises';
import path from 'node:path';
import type { FSWatcher } from 'chokidar';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStorage } from '../../test/fixtures.js';
import { resetDatabase } from '../../test/database.js';
import { prisma } from '../db.js';
import { metaPathFor } from '../modules/uploads/ingest.js';
import { storagePaths } from './storage.js';
import { startUploadWatcher } from './watcher.js';

vi.mock('../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn() }));

const WAIT_TIMEOUT_MS = 10_000;
const POLL_MS = 200;

async function waitForSongs(expectedCount: number): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await prisma.song.count()) >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`Timed out waiting for ${expectedCount} song(s)`);
}

describe('upload folder watcher', () => {
  let watcher: FSWatcher | null = null;

  beforeEach(async () => {
    await resetDatabase();
    await resetStorage();
  });

  afterEach(async () => {
    await watcher?.close();
    watcher = null;
  });

  afterAll(() => prisma.$disconnect());

  it('queues a file copied into the folder, and ignores partial and sidecar files', async () => {
    watcher = startUploadWatcher();
    await new Promise<void>((resolve) => watcher?.on('ready', () => resolve()));

    await fs.writeFile(path.join(storagePaths.uploadDir, 'half.mp3.part'), 'partial');
    const filePath = path.join(storagePaths.uploadDir, 'Banda - Faixa.mp3');
    await fs.writeFile(filePath, 'audio');
    await fs.writeFile(metaPathFor(filePath), JSON.stringify({ originalName: 'Banda - Faixa.mp3' }));

    await waitForSongs(1);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const songs = await prisma.song.findMany({ include: { jobs: true } });
    expect(songs).toHaveLength(1);
    expect(songs[0]).toMatchObject({ artist: 'Banda', title: 'Faixa', status: 'QUEUED' });
    expect(songs[0]?.jobs).toHaveLength(1);
  }, 30_000);

  it('picks up the files that were already there when the watcher starts', async () => {
    await fs.writeFile(path.join(storagePaths.uploadDir, 'Antes - Do Início.mp3'), 'audio');

    watcher = startUploadWatcher();

    await waitForSongs(1);
    expect(await prisma.song.findFirstOrThrow()).toMatchObject({ artist: 'Antes', title: 'Do Início' });
  }, 30_000);
});
