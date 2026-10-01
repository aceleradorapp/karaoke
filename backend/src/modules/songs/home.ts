import type { Job, Song } from '@prisma/client';
import type { HomeResponse, HomeRow } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { toListedSongDTO } from './service.js';

type SongWithLatestJob = Song & { jobs: Job[] };

const ROW_SIZE = 20;
const MAX_ARTIST_ROWS = 3;
const MIN_SONGS_PER_ARTIST_ROW = 3;
const RECENT_PERFORMANCES_SCAN = 100;
const LATEST_JOB = { jobs: { orderBy: { createdAt: 'desc' as const }, take: 1 } };

interface RowDraft {
  id: string;
  title: string;
  songs: SongWithLatestJob[];
}

function readySongs() {
  return { status: 'READY' as const };
}

async function processingRow(): Promise<RowDraft> {
  const songs = await prisma.song.findMany({
    where: { status: { in: ['QUEUED', 'PROCESSING'] } },
    orderBy: { createdAt: 'asc' },
    take: ROW_SIZE,
    include: LATEST_JOB,
  });
  return { id: 'processing', title: 'Em processamento', songs };
}

async function favoritesRow(profileId: string): Promise<RowDraft> {
  const favorites = await prisma.favorite.findMany({
    where: { profileId, song: readySongs() },
    orderBy: { createdAt: 'desc' },
    take: ROW_SIZE,
    include: { song: { include: LATEST_JOB } },
  });
  return { id: 'favorites', title: 'Suas favoritas', songs: favorites.map((favorite) => favorite.song) };
}

async function topRow(): Promise<RowDraft> {
  const songs = await prisma.song.findMany({
    where: { ...readySongs(), playCount: { gt: 0 } },
    orderBy: [{ playCount: 'desc' }, { createdAt: 'desc' }],
    take: ROW_SIZE,
    include: LATEST_JOB,
  });
  return { id: 'top', title: 'Mais cantadas da família', songs };
}

async function recentRow(): Promise<RowDraft> {
  const songs = await prisma.song.findMany({
    where: readySongs(),
    orderBy: { createdAt: 'desc' },
    take: ROW_SIZE,
    include: LATEST_JOB,
  });
  return { id: 'recent', title: 'Adicionadas recentemente', songs };
}

async function sungByProfileRow(profileId: string): Promise<RowDraft> {
  const performances = await prisma.performance.findMany({
    where: { profileId },
    orderBy: { startedAt: 'desc' },
    take: RECENT_PERFORMANCES_SCAN,
    select: { songId: true },
  });
  const orderedIds = [...new Set(performances.map((performance) => performance.songId))].slice(0, ROW_SIZE);
  const songs = await prisma.song.findMany({
    where: { id: { in: orderedIds }, ...readySongs() },
    include: LATEST_JOB,
  });
  const byId = new Map(songs.map((song) => [song.id, song]));
  const ordered = orderedIds.flatMap((id) => byId.get(id) ?? []);
  return { id: 'mine', title: 'Cantadas por você', songs: ordered };
}

async function artistRows(): Promise<RowDraft[]> {
  const groups = await prisma.song.groupBy({
    by: ['artist'],
    where: readySongs(),
    _count: { _all: true },
    having: { artist: { _count: { gte: MIN_SONGS_PER_ARTIST_ROW } } },
    orderBy: [{ _count: { artist: 'desc' } }, { artist: 'asc' }],
    take: MAX_ARTIST_ROWS,
  });

  return Promise.all(
    groups.map(async ({ artist }) => ({
      id: `artist:${artist}`,
      title: artist,
      songs: await prisma.song.findMany({
        where: { artist, ...readySongs() },
        orderBy: { title: 'asc' },
        take: ROW_SIZE,
        include: LATEST_JOB,
      }),
    })),
  );
}

async function favoriteIdsOf(profileId: string | undefined, songIds: string[]): Promise<Set<string> | null> {
  if (!profileId) return null;
  const favorites = await prisma.favorite.findMany({
    where: { profileId, songId: { in: songIds } },
    select: { songId: true },
  });
  return new Set(favorites.map((favorite) => favorite.songId));
}

export async function buildHome(profileId?: string): Promise<HomeResponse> {
  const drafts = await Promise.all([
    processingRow(),
    profileId ? favoritesRow(profileId) : Promise.resolve(null),
    topRow(),
    recentRow(),
    profileId ? sungByProfileRow(profileId) : Promise.resolve(null),
    artistRows(),
  ]);
  const rowDrafts = drafts
    .flat()
    .filter((draft): draft is RowDraft => draft !== null && draft.songs.length > 0);

  const heroSong =
    (await prisma.song.findFirst({
      where: readySongs(),
      orderBy: { createdAt: 'desc' },
      include: LATEST_JOB,
    })) ?? null;

  const allIds = [
    ...new Set([
      ...rowDrafts.flatMap((row) => row.songs.map((song) => song.id)),
      ...(heroSong ? [heroSong.id] : []),
    ]),
  ];
  const favoriteIds = await favoriteIdsOf(profileId, allIds);

  const rows: HomeRow[] = rowDrafts.map((draft) => ({
    id: draft.id,
    title: draft.title,
    items: draft.songs.map((song) => toListedSongDTO(song, favoriteIds)),
  }));

  return { hero: heroSong ? toListedSongDTO(heroSong, favoriteIds) : null, rows };
}
