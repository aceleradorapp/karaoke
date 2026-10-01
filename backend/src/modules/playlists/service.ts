import type {
  PlaylistDetailDTO,
  PlaylistListResponse,
  PlaylistSummaryDTO,
  ReorderPlaylistInput,
} from '@caraoke/shared';
import { prisma } from '../../db.js';
import { AppError, conflict, notFound } from '../../utils/errors.js';
import { coverUrlOf } from '../songs/mapper.js';
import { LATEST_JOB, favoriteIdsOf, toListedSongDTO } from '../songs/service.js';

const COVERS_PER_PLAYLIST = 4;
const BAD_REQUEST = 400;

function playlistNotFound() {
  return notFound('PLAYLIST_NOT_FOUND', 'Playlist não encontrada');
}

async function assertProfileExists(profileId: string): Promise<void> {
  const profile = await prisma.profile.findUnique({ where: { id: profileId }, select: { id: true } });
  if (!profile) throw notFound('PROFILE_NOT_FOUND', 'Perfil não encontrado');
}

async function assertNameAvailable(profileId: string, name: string, ignoreId?: string): Promise<void> {
  const existing = await prisma.playlist.findFirst({
    where: { profileId, name, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
    select: { id: true },
  });
  if (existing) throw conflict('PLAYLIST_NAME_TAKEN', 'Você já tem uma playlist com esse nome');
}

async function findPlaylistOrThrow(id: string) {
  const playlist = await prisma.playlist.findUnique({ where: { id } });
  if (!playlist) throw playlistNotFound();
  return playlist;
}

export async function listPlaylists(profileId: string, songId?: string): Promise<PlaylistListResponse> {
  await assertProfileExists(profileId);

  const [playlists, containing] = await Promise.all([
    prisma.playlist.findMany({
      where: { profileId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        _count: { select: { items: true } },
        items: {
          where: { song: { hasCover: true } },
          orderBy: { position: 'asc' },
          take: COVERS_PER_PLAYLIST,
          include: { song: true },
        },
      },
    }),
    songId
      ? prisma.playlistItem.findMany({
          where: { songId, playlist: { profileId } },
          select: { playlistId: true },
        })
      : Promise.resolve(null),
  ]);

  const containingIds = containing ? new Set(containing.map((item) => item.playlistId)) : null;
  const items = playlists.map((playlist): PlaylistSummaryDTO => {
    const summary: PlaylistSummaryDTO = {
      id: playlist.id,
      name: playlist.name,
      count: playlist._count.items,
      coverUrls: playlist.items.flatMap((item) => coverUrlOf(item.song) ?? []),
    };
    return containingIds ? { ...summary, containsSong: containingIds.has(playlist.id) } : summary;
  });
  return { items };
}

export async function createPlaylist(profileId: string, name: string): Promise<PlaylistSummaryDTO> {
  await assertProfileExists(profileId);
  await assertNameAvailable(profileId, name);
  const playlist = await prisma.playlist.create({ data: { profileId, name } });
  return { id: playlist.id, name: playlist.name, count: 0, coverUrls: [] };
}

export async function getPlaylist(id: string): Promise<PlaylistDetailDTO> {
  const playlist = await prisma.playlist.findUnique({
    where: { id },
    include: {
      items: { orderBy: { position: 'asc' }, include: { song: { include: LATEST_JOB } } },
    },
  });
  if (!playlist) throw playlistNotFound();

  const songs = playlist.items.map((item) => item.song);
  const favoriteIds = await favoriteIdsOf(
    playlist.profileId,
    songs.map((song) => song.id),
  );
  return {
    id: playlist.id,
    name: playlist.name,
    profileId: playlist.profileId,
    items: songs.map((song) => toListedSongDTO(song, favoriteIds)),
  };
}

export async function renamePlaylist(id: string, name: string): Promise<PlaylistSummaryDTO> {
  const playlist = await findPlaylistOrThrow(id);
  await assertNameAvailable(playlist.profileId, name, id);
  const [updated, count] = await Promise.all([
    prisma.playlist.update({ where: { id }, data: { name } }),
    prisma.playlistItem.count({ where: { playlistId: id } }),
  ]);
  return { id: updated.id, name: updated.name, count, coverUrls: [] };
}

export async function deletePlaylist(id: string): Promise<void> {
  await findPlaylistOrThrow(id);
  await prisma.playlist.delete({ where: { id } });
}

export async function addItem(playlistId: string, songId: string): Promise<void> {
  await findPlaylistOrThrow(playlistId);
  const song = await prisma.song.findUnique({ where: { id: songId }, select: { id: true } });
  if (!song) throw notFound('SONG_NOT_FOUND', 'Música não encontrada');

  const alreadyThere = await prisma.playlistItem.findUnique({
    where: { playlistId_songId: { playlistId, songId } },
    select: { songId: true },
  });
  if (alreadyThere) return;

  const last = await prisma.playlistItem.aggregate({ where: { playlistId }, _max: { position: true } });
  await prisma.$transaction([
    prisma.playlistItem.create({
      data: { playlistId, songId, position: (last._max.position ?? -1) + 1 },
    }),
    prisma.playlist.update({ where: { id: playlistId }, data: { updatedAt: new Date() } }),
  ]);
}

export async function removeItem(playlistId: string, songId: string): Promise<void> {
  await findPlaylistOrThrow(playlistId);
  await prisma.playlistItem.deleteMany({ where: { playlistId, songId } });
}

export async function reorderItems(playlistId: string, input: ReorderPlaylistInput): Promise<void> {
  await findPlaylistOrThrow(playlistId);
  const current = await prisma.playlistItem.findMany({ where: { playlistId }, select: { songId: true } });

  const requested = new Set(input.songIds);
  const isSamePlaylist =
    requested.size === input.songIds.length &&
    requested.size === current.length &&
    current.every((item) => requested.has(item.songId));
  if (!isSamePlaylist) {
    throw new AppError(
      'INVALID_ORDER',
      'A nova ordem precisa ter exatamente as músicas da playlist',
      BAD_REQUEST,
    );
  }

  await prisma.$transaction(
    input.songIds.map((songId, position) =>
      prisma.playlistItem.update({
        where: { playlistId_songId: { playlistId, songId } },
        data: { position },
      }),
    ),
  );
}
