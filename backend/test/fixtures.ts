import fs from 'node:fs/promises';
import path from 'node:path';
import type { Job, JobStatus, Song, SongSource, SongStatus } from '@prisma/client';
import { prisma } from '../src/db.js';
import { ensureDirs, storagePaths } from '../src/services/storage.js';

export async function resetStorage(): Promise<void> {
  await fs.rm(storagePaths.root, { recursive: true, force: true });
  await ensureDirs();
}

export async function fileExists(filePath: string): Promise<boolean> {
  return fs.stat(filePath).then(
    () => true,
    () => false,
  );
}

export async function listDirectory(dir: string): Promise<string[]> {
  return fs.readdir(dir).catch(() => []);
}

interface JobFixtureOptions {
  title?: string;
  source?: SongSource;
  position?: number;
  status?: JobStatus;
  songStatus?: SongStatus;
  withOriginFile?: boolean;
  finishedAt?: Date | null;
  attempts?: number;
}

export interface JobFixture {
  song: Song;
  job: Job;
  sourcePath: string | null;
}

let youtubeIdCounter = 0;

function nextYoutubeId(): string {
  youtubeIdCounter += 1;
  return `yt${String(youtubeIdCounter).padStart(9, '0')}`;
}

export async function createJobFixture(options: JobFixtureOptions = {}): Promise<JobFixture> {
  const source = options.source ?? 'UPLOAD';
  const song = await prisma.song.create({
    data: {
      title: options.title ?? 'Song',
      artist: 'Artist',
      source,
      status: options.songStatus ?? 'QUEUED',
      youtubeId: source === 'YOUTUBE' ? nextYoutubeId() : null,
    },
  });

  let sourcePath: string | null = null;
  if (options.withOriginFile) {
    sourcePath = path.join(storagePaths.uploadDir, `${song.id}.mp3`);
    await fs.writeFile(sourcePath, 'audio');
  }

  const job = await prisma.job.create({
    data: {
      songId: song.id,
      position: options.position ?? 1,
      status: options.status ?? 'PENDING',
      sourcePath,
      finishedAt: options.finishedAt ?? null,
      attempts: options.attempts ?? 0,
    },
  });

  return { song, job, sourcePath };
}
