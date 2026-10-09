import type { SingerKeyInput } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { notFound } from '../../utils/errors.js';

export async function getSingerKey(songId: string, profileId: string): Promise<number> {
  const saved = await prisma.singerSongKey.findUnique({ where: { profileId_songId: { profileId, songId } } });
  return saved?.keyShift ?? 0;
}

export async function saveSingerKey(songId: string, input: SingerKeyInput): Promise<number> {
  const [song, profile] = await Promise.all([
    prisma.song.findUnique({ where: { id: songId }, select: { id: true } }),
    prisma.profile.findUnique({ where: { id: input.profileId }, select: { id: true } }),
  ]);
  if (!song) throw notFound('SONG_NOT_FOUND', 'Música não encontrada');
  if (!profile) throw notFound('PROFILE_NOT_FOUND', 'Perfil não encontrado');

  const where = { profileId_songId: { profileId: input.profileId, songId } };
  if (input.keyShift === 0) {
    await prisma.singerSongKey.deleteMany({ where: { profileId: input.profileId, songId } });
  } else {
    await prisma.singerSongKey.upsert({
      where,
      update: { keyShift: input.keyShift },
      create: { profileId: input.profileId, songId, keyShift: input.keyShift },
    });
  }
  return input.keyShift;
}
