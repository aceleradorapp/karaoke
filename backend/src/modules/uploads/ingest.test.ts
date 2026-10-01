import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileExists, resetStorage } from '../../../test/fixtures.js';
import { resetDatabase } from '../../../test/database.js';
import { prisma } from '../../db.js';
import { storagePaths } from '../../services/storage.js';
import { ingestUploadedFile, metaPathFor } from './ingest.js';

vi.mock('../../realtime.js', () => ({ emitToRoom: vi.fn(), emitToAll: vi.fn() }));
vi.mock('music-metadata', () => ({ parseFile: vi.fn() }));

const parseFileMock = vi.mocked(parseFile);

function tagsResult(common: { artist?: string; title?: string }, duration?: number) {
  return { common, format: { duration } } as Awaited<ReturnType<typeof parseFile>>;
}

async function dropFile(name: string, meta?: Record<string, unknown>): Promise<string> {
  const filePath = path.join(storagePaths.uploadDir, name);
  await fs.writeFile(filePath, 'audio');
  if (meta) await fs.writeFile(metaPathFor(filePath), JSON.stringify(meta));
  return filePath;
}

describe('ingestUploadedFile', () => {
  beforeEach(async () => {
    await resetDatabase();
    await resetStorage();
    parseFileMock.mockReset();
    parseFileMock.mockRejectedValue(new Error('not a real audio file'));
  });

  afterAll(() => prisma.$disconnect());

  it('creates a queued upload song and a pending job pointing to the file', async () => {
    const filePath = await dropFile('Artista - Música.mp3');

    expect(await ingestUploadedFile(filePath)).toBe(true);

    const song = await prisma.song.findFirstOrThrow({ include: { jobs: true } });
    expect(song).toMatchObject({
      title: 'Música',
      artist: 'Artista',
      source: 'UPLOAD',
      status: 'QUEUED',
      originalFilename: 'Artista - Música.mp3',
      durationSec: null,
    });
    expect(song.jobs).toHaveLength(1);
    expect(song.jobs[0]).toMatchObject({
      status: 'PENDING',
      position: 1,
      sourcePath: path.resolve(filePath),
    });
  });

  it('uses an unknown artist when the file name has no separator', async () => {
    await ingestUploadedFile(await dropFile('Evidências.mp3'));
    expect(await prisma.song.findFirstOrThrow()).toMatchObject({
      title: 'Evidências',
      artist: 'Desconhecido',
    });
  });

  it('prefers the tags written in the audio file and stores its duration', async () => {
    parseFileMock.mockResolvedValue(tagsResult({ artist: 'Tag Artist', title: 'Tag Title' }, 215.4));

    await ingestUploadedFile(await dropFile('Outro - Nome.mp3'));

    expect(await prisma.song.findFirstOrThrow()).toMatchObject({
      artist: 'Tag Artist',
      title: 'Tag Title',
      durationSec: 215,
    });
  });

  it('falls back to the file name when the tags are incomplete', async () => {
    parseFileMock.mockResolvedValue(tagsResult({ title: 'Only Title' }, 100));

    await ingestUploadedFile(await dropFile('Banda - Faixa.mp3'));

    expect(await prisma.song.findFirstOrThrow()).toMatchObject({
      artist: 'Banda',
      title: 'Faixa',
      durationSec: 100,
    });
  });

  it('recovers the original name from the sidecar file and removes it afterwards', async () => {
    const filePath = await dropFile('1790864238488-0-Artista-Musica.mp3', {
      originalName: 'Artista - Música.mp3',
    });

    await ingestUploadedFile(filePath);

    expect(await prisma.song.findFirstOrThrow()).toMatchObject({ artist: 'Artista', title: 'Música' });
    expect(await fileExists(metaPathFor(filePath))).toBe(false);
  });

  it('strips the stored-name prefix when there is no sidecar file', async () => {
    await ingestUploadedFile(await dropFile('1790864238488-2-Artista - Música.mp3'));
    expect(await prisma.song.findFirstOrThrow()).toMatchObject({ artist: 'Artista', title: 'Música' });
  });

  it('uses the title and artist from the sidecar file when there are no tags', async () => {
    await ingestUploadedFile(await dropFile('x.mp3', { title: 'Meta Title', artist: 'Meta Artist' }));
    expect(await prisma.song.findFirstOrThrow()).toMatchObject({
      artist: 'Meta Artist',
      title: 'Meta Title',
    });
  });

  it('records who uploaded the song and ignores an unknown profile', async () => {
    const profile = await prisma.profile.create({ data: { name: 'Ana', avatar: 'lion' } });

    await ingestUploadedFile(await dropFile('A - B.mp3', { profileId: profile.id }));
    await ingestUploadedFile(await dropFile('C - D.mp3', { profileId: 'unknown' }));

    const songs = await prisma.song.findMany({ orderBy: { createdAt: 'asc' } });
    expect(songs.map((song) => song.addedById)).toEqual([profile.id, null]);
  });

  it('does not queue the same file twice', async () => {
    const filePath = await dropFile('A - B.mp3');

    expect(await ingestUploadedFile(filePath)).toBe(true);
    expect(await ingestUploadedFile(filePath)).toBe(false);

    expect(await prisma.song.count()).toBe(1);
    expect(await prisma.job.count()).toBe(1);
  });

  it('ignores files that are not supported audio', async () => {
    expect(await ingestUploadedFile(await dropFile('notes.txt'))).toBe(false);
    expect(await ingestUploadedFile(await dropFile('song.mp3.part'))).toBe(false);
    expect(await prisma.song.count()).toBe(0);
  });

  it('survives a corrupted sidecar file', async () => {
    const filePath = await dropFile('A - B.mp3');
    await fs.writeFile(metaPathFor(filePath), '{ not json');

    expect(await ingestUploadedFile(filePath)).toBe(true);
    expect(await prisma.song.findFirstOrThrow()).toMatchObject({ artist: 'A', title: 'B' });
  });

  it('truncates very long names to fit the database', async () => {
    parseFileMock.mockResolvedValue(tagsResult({ artist: 'a'.repeat(300), title: 't'.repeat(300) }));

    await ingestUploadedFile(await dropFile('long.mp3'));

    const song = await prisma.song.findFirstOrThrow();
    expect([song.artist.length, song.title.length]).toEqual([200, 200]);
  });

  it('queues several files in the order they arrive', async () => {
    await ingestUploadedFile(await dropFile('A - 1.mp3'));
    await ingestUploadedFile(await dropFile('B - 2.mp3'));

    const jobs = await prisma.job.findMany({ orderBy: { position: 'asc' }, include: { song: true } });
    expect(jobs.map((job) => [job.position, job.song.title])).toEqual([
      [1, '1'],
      [2, '2'],
    ]);
  });
});
