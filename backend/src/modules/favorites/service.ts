import type { FavoritesResponse } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { notFound } from '../../utils/errors.js';
import { LATEST_JOB, toListedSongDTO } from '../songs/service.js';

async function assertProfileExists(profileId: string): Promise<void> {
  const profile = await prisma.profile.findUnique({ where: { id: profileId }, select: { id: true } });
  if (!profile) throw notFound('PROFILE_NOT_FOUND', 'Perfil não encontrado');
}

export async function listFavorites(profileId: string): Promise<FavoritesResponse> {
  await assertProfileExists(profileId);
  const favorites = await prisma.favorite.findMany({
    where: { profileId },
    orderBy: [{ createdAt: 'desc' }, { songId: 'asc' }],
    include: { song: { include: LATEST_JOB } },
  });
  const favoriteIds = new Set(favorites.map((favorite) => favorite.songId));
  return { items: favorites.map((favorite) => toListedSongDTO(favorite.song, favoriteIds)) };
}

export async function addFavorite(profileId: string, songId: string): Promise<void> {
  await assertProfileExists(profileId);
  const song = await prisma.song.findUnique({ where: { id: songId }, select: { id: true } });
  if (!song) throw notFound('SONG_NOT_FOUND', 'Música não encontrada');
  await prisma.favorite.upsert({
    where: { profileId_songId: { profileId, songId } },
    create: { profileId, songId },
    update: {},
  });
}

export async function removeFavorite(profileId: string, songId: string): Promise<void> {
  await assertProfileExists(profileId);
  await prisma.favorite.deleteMany({ where: { profileId, songId } });
}
