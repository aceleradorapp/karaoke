import type {
  CreatePerformanceInput,
  FinishPerformanceInput,
  FinishPerformanceResult,
  HistoryResponse,
} from '@caraoke/shared';
import { prisma } from '../../db.js';
import { conflict, notFound } from '../../utils/errors.js';
import { competitionRulesFor, onCompetitionPerformanceScored } from '../competitions/service.js';
import { getAppSettings } from '../settings/service.js';
import { publishSingQueue } from '../singQueue/service.js';
import { LATEST_JOB, favoriteIdsOf, toListedSongDTO } from '../songs/service.js';
import { computeFinalScore, startVoting, usesAudience } from './voting.js';

export async function startPerformance(input: CreatePerformanceInput): Promise<{ id: string }> {
  const [profile, song] = await Promise.all([
    prisma.profile.findUnique({ where: { id: input.profileId }, select: { id: true } }),
    prisma.song.findUnique({ where: { id: input.songId }, select: { id: true, status: true } }),
  ]);
  if (!profile) throw notFound('PROFILE_NOT_FOUND', 'Perfil não encontrado');
  if (!song) throw notFound('SONG_NOT_FOUND', 'Música não encontrada');
  if (song.status !== 'READY')
    throw conflict('SONG_NOT_READY', 'Esta música ainda não está pronta para cantar');

  const request = input.requestId
    ? await prisma.singRequest.findUnique({ where: { id: input.requestId }, select: { competitionId: true } })
    : null;
  const [performance, , removedRequests] = await prisma.$transaction([
    prisma.performance.create({
      data: {
        profileId: input.profileId,
        songId: input.songId,
        competitionId: request?.competitionId ?? null,
      },
    }),
    prisma.song.update({ where: { id: input.songId }, data: { playCount: { increment: 1 } } }),
    prisma.singRequest.deleteMany({ where: { id: input.requestId ?? '' } }),
  ]);
  if (removedRequests.count > 0) await publishSingQueue();
  return { id: performance.id };
}

export async function finishPerformance(
  id: string,
  input: FinishPerformanceInput,
): Promise<FinishPerformanceResult> {
  const performance = await prisma.performance.findUnique({
    where: { id },
    select: { finishedAt: true, profileId: true, competitionId: true },
  });
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
  if (!input.completed) {
    await onCompetitionPerformanceScored(performance.competitionId);
    return { finalScore: null };
  }

  const [settings, rules] = await Promise.all([
    getAppSettings(),
    competitionRulesFor(performance.competitionId),
  ]);
  const mode = rules?.scoringMode ?? settings['scoring.mode'];
  if (usesAudience(mode)) {
    const seconds = rules?.voteSeconds ?? settings['scoring.voteSeconds'];
    const endsAt = await startVoting(id, performance.profileId, seconds);
    return { voting: { endsAt: endsAt.toISOString() } };
  }

  const finalScore = computeFinalScore(mode, input.pitchScore, null, settings['scoring.audienceWeight']);
  await prisma.performance.update({ where: { id }, data: { finalScore } });
  await onCompetitionPerformanceScored(performance.competitionId);
  return { finalScore };
}

export async function listHistory(
  profileId: string,
  limit: number,
  cursor?: string,
): Promise<HistoryResponse> {
  const profile = await prisma.profile.findUnique({ where: { id: profileId }, select: { id: true } });
  if (!profile) throw notFound('PROFILE_NOT_FOUND', 'Perfil não encontrado');

  const performances = await prisma.performance.findMany({
    where: { profileId },
    orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { song: { include: LATEST_JOB } },
  });

  const hasMore = performances.length > limit;
  const page = hasMore ? performances.slice(0, limit) : performances;
  const favoriteIds = await favoriteIdsOf(
    profileId,
    page.map((performance) => performance.songId),
  );

  return {
    items: page.map((performance) => ({
      id: performance.id,
      song: toListedSongDTO(performance.song, favoriteIds),
      startedAt: performance.startedAt.toISOString(),
      finalScore: performance.finalScore,
      pitchScore: performance.pitchScore,
      audienceScore: performance.audienceScore,
      completed: performance.completed,
    })),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
  };
}
