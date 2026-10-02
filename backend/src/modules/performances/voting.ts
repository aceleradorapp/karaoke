import { Prisma } from '@prisma/client';
import type { AppSettings, CastVoteInput, FinalScore, VotingSummary } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { emitToAll, emitToRoom } from '../../realtime.js';
import { conflict, notFound } from '../../utils/errors.js';
import { getAppSettings } from '../settings/service.js';

type ScoringMode = AppSettings['scoring.mode'];

interface OpenVoting {
  performanceId: string;
  singerId: string;
  endsAt: Date;
  timer: NodeJS.Timeout;
}

const MAX_STARS = 5;
const UNIQUE_CONSTRAINT_FAILED = 'P2002';
const MS_PER_SECOND = 1000;

let openVoting: OpenVoting | null = null;

export function usesAudience(mode: ScoringMode): boolean {
  return mode === 'audience' || mode === 'pitch+audience';
}

export function computeFinalScore(
  mode: ScoringMode,
  pitch: number | null,
  audience: number | null,
  audienceWeight: number,
): number | null {
  switch (mode) {
    case 'off':
      return null;
    case 'pitch':
      return pitch;
    case 'audience':
      return audience;
    case 'pitch+audience':
      if (pitch == null) return audience;
      if (audience == null) return pitch;
      return Math.round(pitch * (1 - audienceWeight) + audience * audienceWeight);
  }
}

export function audienceScoreOf(stars: number[]): number | null {
  if (stars.length === 0) return null;
  const average = stars.reduce((sum, value) => sum + value, 0) / stars.length;
  return Math.round((average / MAX_STARS) * 100);
}

function votingClosed() {
  return conflict('VOTING_CLOSED', 'A votação desta música já terminou');
}

async function summaryOf(voting: OpenVoting): Promise<VotingSummary | null> {
  const performance = await prisma.performance.findUnique({
    where: { id: voting.performanceId },
    include: { profile: true, song: true },
  });
  if (!performance) return null;
  return {
    performanceId: performance.id,
    singer: {
      id: performance.profile.id,
      name: performance.profile.name,
      avatar: performance.profile.avatar,
    },
    song: { title: performance.song.title, artist: performance.song.artist },
    endsAt: voting.endsAt.toISOString(),
  };
}

export async function closeVoting(performanceId: string): Promise<FinalScore> {
  if (openVoting?.performanceId !== performanceId) throw votingClosed();
  clearTimeout(openVoting.timer);
  openVoting = null;

  const [performance, votes, settings] = await Promise.all([
    prisma.performance.findUniqueOrThrow({ where: { id: performanceId } }),
    prisma.vote.findMany({ where: { performanceId }, select: { stars: true } }),
    getAppSettings(),
  ]);
  const audienceScore = audienceScoreOf(votes.map((vote) => vote.stars));
  const finalScore = computeFinalScore(
    settings['scoring.mode'],
    performance.pitchScore,
    audienceScore,
    settings['scoring.audienceWeight'],
  );
  await prisma.performance.update({ where: { id: performanceId }, data: { audienceScore, finalScore } });

  const result: FinalScore = {
    performanceId,
    pitchScore: performance.pitchScore,
    audienceScore,
    finalScore,
    votes: votes.length,
  };
  emitToAll('score:final', result);
  return result;
}

export async function startVoting(performanceId: string, singerId: string, seconds: number): Promise<Date> {
  if (openVoting) await closeVoting(openVoting.performanceId);

  const endsAt = new Date(Date.now() + seconds * MS_PER_SECOND);
  const timer = setTimeout(() => {
    void closeVoting(performanceId).catch(() => undefined);
  }, seconds * MS_PER_SECOND);
  openVoting = { performanceId, singerId, endsAt, timer };

  const summary = await summaryOf(openVoting);
  if (summary) emitToAll('vote:open', summary);
  return endsAt;
}

export async function currentVoting(): Promise<VotingSummary | null> {
  return openVoting ? summaryOf(openVoting) : null;
}

export async function castVote(performanceId: string, input: CastVoteInput): Promise<{ votes: number }> {
  const exists = await prisma.performance.findUnique({ where: { id: performanceId }, select: { id: true } });
  if (!exists) throw notFound('PERFORMANCE_NOT_FOUND', 'Apresentação não encontrada');
  if (openVoting?.performanceId !== performanceId) throw votingClosed();
  if (input.voterProfileId && input.voterProfileId === openVoting.singerId) {
    throw conflict('CANNOT_VOTE_FOR_SELF', 'Quem cantou não vota na própria apresentação');
  }

  try {
    await prisma.vote.create({ data: { performanceId, voterToken: input.voterToken, stars: input.stars } });
  } catch (error) {
    const isDuplicate =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_FAILED;
    if (isDuplicate) throw conflict('ALREADY_VOTED', 'Você já votou nesta música');
    throw error;
  }

  const votes = await prisma.vote.count({ where: { performanceId } });
  emitToRoom('stage', 'vote:progress', { performanceId, count: votes });
  return { votes };
}

export function cancelOpenVoting(): void {
  if (openVoting) clearTimeout(openVoting.timer);
  openVoting = null;
}
