import fs from 'node:fs/promises';
import { toLrc, type LyricsDoc, type SaveLyricsInput, type SongDTO } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { emitToAll } from '../../realtime.js';
import { songFile } from '../../services/storage.js';
import { notFound } from '../../utils/errors.js';
import { LATEST_JOB, toListedSongDTO } from './service.js';

const LYRICS_FILE = 'letra.json';
const LRC_FILE = 'letra.lrc';
const ORIGINAL_FILE = 'letra.original.json';

async function exists(filePath: string): Promise<boolean> {
  return fs.stat(filePath).then(
    () => true,
    () => false,
  );
}

async function assertSongExists(songId: string): Promise<void> {
  const song = await prisma.song.findUnique({ where: { id: songId }, select: { id: true } });
  if (!song) throw notFound('SONG_NOT_FOUND', 'Música não encontrada');
}

async function writeLyricsFiles(songId: string, doc: LyricsDoc): Promise<void> {
  await fs.writeFile(songFile(songId, LYRICS_FILE), JSON.stringify(doc), 'utf-8');
  if (doc.synced) await fs.writeFile(songFile(songId, LRC_FILE), toLrc(doc.lines), 'utf-8');
  else await fs.rm(songFile(songId, LRC_FILE), { force: true });
}

async function keepOriginal(songId: string): Promise<void> {
  const original = songFile(songId, ORIGINAL_FILE);
  const current = songFile(songId, LYRICS_FILE);
  if ((await exists(original)) || !(await exists(current))) return;
  await fs.copyFile(current, original);
}

async function publishUpdated(songId: string): Promise<SongDTO> {
  const song = await prisma.song.findUniqueOrThrow({ where: { id: songId }, include: LATEST_JOB });
  const dto = toListedSongDTO(song, null);
  emitToAll('song:updated', dto);
  return dto;
}

export async function saveLyrics(songId: string, input: SaveLyricsInput): Promise<SongDTO> {
  await assertSongExists(songId);
  await fs.mkdir(songFile(songId, '.'), { recursive: true });
  await keepOriginal(songId);

  const doc: LyricsDoc = {
    version: 1,
    source: 'MANUAL',
    synced: input.synced,
    ...(input.language ? { language: input.language } : {}),
    lines: input.lines,
  };
  await writeLyricsFiles(songId, doc);
  await prisma.song.update({
    where: { id: songId },
    data: { lyricsSource: 'MANUAL', lyricsNeedsReview: false, lyricsOffsetMs: 0 },
  });
  return publishUpdated(songId);
}

async function readOriginal(songId: string): Promise<LyricsDoc | null> {
  const raw = await fs.readFile(songFile(songId, ORIGINAL_FILE), 'utf-8').catch(() => null);
  return raw ? (JSON.parse(raw) as LyricsDoc) : null;
}

export async function getOriginalLyrics(songId: string): Promise<LyricsDoc> {
  await assertSongExists(songId);
  const original = await readOriginal(songId);
  if (!original) throw notFound('NO_ORIGINAL_LYRICS', 'Esta música não tem uma letra original guardada');
  return original;
}

export async function restoreOriginalLyrics(songId: string): Promise<SongDTO> {
  const original = await getOriginalLyrics(songId);
  await writeLyricsFiles(songId, original);
  await prisma.song.update({
    where: { id: songId },
    data: {
      lyricsSource: original.source,
      lyricsOffsetMs: 0,
      lyricsNeedsReview: original.source === 'PLAIN',
    },
  });
  return publishUpdated(songId);
}
