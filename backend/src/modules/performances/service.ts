import type { CreatePerformanceInput, FinishPerformanceInput } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { conflict, notFound } from '../../utils/errors.js';

export interface FinishPerformanceResult {
  finalScore: number | null;
}

export async function startPerformance(input: CreatePerformanceInput): Promise<{ id: string }> {
  const [profile, song] = await Promise.all([
    prisma.profile.findUnique({ where: { id: input.profileId }, select: { id: true } }),
    prisma.song.findUnique({ where: { id: input.songId }, select: { id: true, status: true } }),
  ]);
  if (!profile) throw notFound('PROFILE_NOT_FOUND', 'Perfil não encontrado');
  if (!song) throw notFound('SONG_NOT_FOUND', 'Música não encontrada');
  if (song.status !== 'READY')
    throw conflict('SONG_NOT_READY', 'Esta música ainda não está pronta para cantar');

  const [performance] = await prisma.$transaction([
    prisma.performance.create({ data: { profileId: input.profileId, songId: input.songId } }),
    prisma.song.update({ where: { id: input.songId }, data: { playCount: { increment: 1 } } }),
  ]);
  return { id: performance.id };
}

export async function finishPerformance(
  id: string,
  input: FinishPerformanceInput,
): Promise<FinishPerformanceResult> {
  const performance = await prisma.performance.findUnique({ where: { id }, select: { finishedAt: true } });
  if (!performance) throw notFound('PERFORMANCE_NOT_FOUND', 'Apresentação não encontrada');
  if (performance.finishedAt) {
    throw conflict('PERFORMANCE_ALREADY_FINISHED', 'Esta apresentação já foi encerrada');
  }

  await prisma.performance.update({
    where: { id },
    data: {
      finishedAt: new Date(),
      completed: input.completed,
      voiceGuideUsed: input.voiceGuideUsed,
      pitchScore: input.pitchScore,
    },
  });
  return { finalScore: null };
}
