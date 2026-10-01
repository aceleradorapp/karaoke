import type { Job, Prisma, Song, SongStatus } from '@prisma/client';
import type { SongDTO, SongListResponse, UpdateSongInput } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { emitToAll } from '../../realtime.js';
import { deleteSongDir, moveToError } from '../../services/storage.js';
import { conflict, notFound } from '../../utils/errors.js';
import { toSongDTO } from './mapper.js';

export type SongSort = 'recent' | 'title' | 'artist' | 'popular';

export interface ListSongsParams {
  q?: string;
  status?: SongStatus;
  artist?: string;
  sort: SongSort;
  limit: number;
  cursor?: string;
  profileId?: string;
}

type SongWithLatestJob = Song & { jobs: Job[] };

const ORDER_BY: Record<SongSort, Prisma.SongOrderByWithRelationInput[]> = {
  recent: [{ createdAt: 'desc' }, { id: 'asc' }],
  title: [{ title: 'asc' }, { id: 'asc' }],
  artist: [{ artist: 'asc' }, { title: 'asc' }, { id: 'asc' }],
  popular: [{ playCount: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
};

const LATEST_JOB = { jobs: { orderBy: { createdAt: 'desc' as const }, take: 1 } };

function songNotFound() {
  return notFound('SONG_NOT_FOUND', 'Música não encontrada');
}

function buildWhere(params: ListSongsParams): Prisma.SongWhereInput {
  const tokens = (params.q ?? '').split(/\s+/).filter(Boolean);
  return {
    ...(params.status ? { status: params.status } : {}),
    ...(params.artist ? { artist: params.artist } : {}),
    AND: tokens.map((token) => ({ OR: [{ title: { contains: token } }, { artist: { contains: token } }] })),
  };
}

async function favoriteIdsOf(profileId: string | undefined, songIds: string[]): Promise<Set<string> | null> {
  if (!profileId) return null;
  const favorites = await prisma.favorite.findMany({
    where: { profileId, songId: { in: songIds } },
    select: { songId: true },
  });
  return new Set(favorites.map((favorite) => favorite.songId));
}

export function toListedSongDTO(song: SongWithLatestJob, favoriteIds: Set<string> | null): SongDTO {
  const job = song.status === 'READY' ? undefined : (song.jobs[0] ?? null);
  return toSongDTO(song, job, favoriteIds ? favoriteIds.has(song.id) : undefined);
}

export async function listSongs(params: ListSongsParams): Promise<SongListResponse> {
  const songs = await prisma.song.findMany({
    where: buildWhere(params),
    orderBy: ORDER_BY[params.sort],
    take: params.limit + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    include: LATEST_JOB,
  });

  const hasMore = songs.length > params.limit;
  const page = hasMore ? songs.slice(0, params.limit) : songs;
  const favoriteIds = await favoriteIdsOf(
    params.profileId,
    page.map((song) => song.id),
  );

  return {
    items: page.map((song) => toListedSongDTO(song, favoriteIds)),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
  };
}

async function findSongOrThrow(id: string): Promise<SongWithLatestJob> {
  const song = await prisma.song.findUnique({ where: { id }, include: LATEST_JOB });
  if (!song) throw songNotFound();
  return song;
}

export async function getSong(id: string, profileId?: string): Promise<SongDTO> {
  const song = await findSongOrThrow(id);
  return toListedSongDTO(song, await favoriteIdsOf(profileId, [id]));
}

export async function updateSong(id: string, changes: UpdateSongInput): Promise<SongDTO> {
  await findSongOrThrow(id);
  const updated = await prisma.song.update({ where: { id }, data: changes, include: LATEST_JOB });
  const dto = toListedSongDTO(updated, null);
  emitToAll('song:updated', dto);
  return dto;
}

export async function deleteSong(id: string): Promise<void> {
  const song = await prisma.song.findUnique({ where: { id }, include: { jobs: true } });
  if (!song) throw songNotFound();

  if (song.jobs.some((job) => job.status === 'RUNNING')) {
    throw conflict('SONG_BEING_PROCESSED', 'Cancele o processamento antes de excluir a música');
  }

  for (const job of song.jobs) {
    if (job.status === 'PENDING' && job.sourcePath) await moveToError(job.sourcePath);
  }

  await prisma.song.delete({ where: { id } });
  await deleteSongDir(id);
  emitToAll('song:deleted', { id });
}
