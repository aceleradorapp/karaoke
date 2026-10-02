import type { Prisma } from '@prisma/client';
import type { RankingPeriod, RankingProfile, RankingResponse, RankingScope } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { LATEST_JOB, toListedSongDTO } from '../songs/service.js';

const LIST_LIMIT = 10;
const MIN_SCORED_PERFORMANCES = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<Exclude<RankingPeriod, 'all'>, number> = { week: 7, month: 30 };

export function periodStart(period: RankingPeriod, now: Date): Date | null {
  return period === 'all' ? null : new Date(now.getTime() - PERIOD_DAYS[period] * DAY_MS);
}

export function monthStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function performanceFilter(since: Date | null, scope: RankingScope): Prisma.PerformanceWhereInput {
  return {
    ...(since ? { startedAt: { gte: since } } : {}),
    ...(scope === 'family' ? { profile: { isGuest: false } } : {}),
  };
}

async function profilesById(ids: string[]): Promise<Map<string, RankingProfile>> {
  const profiles = await prisma.profile.findMany({ where: { id: { in: ids } } });
  return new Map(
    profiles.map((profile) => [
      profile.id,
      { id: profile.id, name: profile.name, avatar: profile.avatar, isGuest: profile.isGuest },
    ]),
  );
}

async function bestAverages(where: Prisma.PerformanceWhereInput, limit: number) {
  const groups = await prisma.performance.groupBy({
    by: ['profileId'],
    where: { ...where, finalScore: { not: null } },
    _avg: { finalScore: true },
    _count: { _all: true },
    having: { profileId: { _count: { gte: MIN_SCORED_PERFORMANCES } } },
    orderBy: { _avg: { finalScore: 'desc' } },
    take: limit,
  });
  const profiles = await profilesById(groups.map((group) => group.profileId));
  return groups.flatMap((group) => {
    const profile = profiles.get(group.profileId);
    return profile
      ? [{ profile, avg: Math.round(group._avg.finalScore ?? 0), count: group._count._all }]
      : [];
  });
}

export async function getRanking(
  period: RankingPeriod,
  scope: RankingScope,
  now: Date = new Date(),
): Promise<RankingResponse> {
  const where = performanceFilter(periodStart(period, now), scope);
  const completed = { ...where, completed: true };

  const [bestAverage, champion, sungGroups, songGroups] = await Promise.all([
    bestAverages(where, LIST_LIMIT),
    bestAverages(performanceFilter(monthStart(now), scope), 1),
    prisma.performance.groupBy({
      by: ['profileId'],
      where: completed,
      _count: { _all: true },
      orderBy: { _count: { profileId: 'desc' } },
      take: LIST_LIMIT,
    }),
    prisma.performance.groupBy({
      by: ['songId'],
      where: completed,
      _count: { _all: true },
      orderBy: { _count: { songId: 'desc' } },
      take: LIST_LIMIT,
    }),
  ]);

  const [singers, songs] = await Promise.all([
    profilesById(sungGroups.map((group) => group.profileId)),
    prisma.song.findMany({
      where: { id: { in: songGroups.map((group) => group.songId) } },
      include: LATEST_JOB,
    }),
  ]);
  const songsById = new Map(songs.map((song) => [song.id, toListedSongDTO(song, null)]));

  return {
    bestAverage,
    mostSung: sungGroups.flatMap((group) => {
      const profile = singers.get(group.profileId);
      return profile ? [{ profile, count: group._count._all }] : [];
    }),
    topSongs: songGroups.flatMap((group) => {
      const song = songsById.get(group.songId);
      return song ? [{ song, count: group._count._all }] : [];
    }),
    champion: champion[0] ? { profile: champion[0].profile, avg: champion[0].avg } : null,
  };
}
