import type { GuestDTO } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { emitToAll } from '../../realtime.js';
import { publishSingQueue } from '../singQueue/service.js';
import { toProfileDTO } from './service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function listGuests(): Promise<GuestDTO[]> {
  const [guests, stats] = await Promise.all([
    prisma.profile.findMany({ where: { isGuest: true } }),
    prisma.performance.groupBy({
      by: ['profileId'],
      where: { profile: { isGuest: true } },
      _max: { startedAt: true },
      _count: { _all: true },
    }),
  ]);
  const statsByProfile = new Map(stats.map((stat) => [stat.profileId, stat]));

  return guests
    .map((guest) => {
      const stat = statsByProfile.get(guest.id);
      return {
        ...toProfileDTO(guest),
        lastSungAt: stat?._max.startedAt?.toISOString() ?? null,
        timesSung: stat?._count._all ?? 0,
      };
    })
    .sort((a, b) => lastActivity(b) - lastActivity(a));
}

function lastActivity(guest: GuestDTO): number {
  return Date.parse(guest.lastSungAt ?? guest.createdAt);
}

export async function listStaleGuests(days: number, now: number = Date.now()): Promise<GuestDTO[]> {
  const limit = now - days * DAY_MS;
  return (await listGuests()).filter((guest) => lastActivity(guest) < limit);
}

export async function deleteGuests(ids: string[]): Promise<{ deleted: string[] }> {
  const guests = await prisma.profile.findMany({
    where: { id: { in: [...new Set(ids)] }, isGuest: true },
    select: { id: true },
  });
  const deleted = guests.map((guest) => guest.id);
  if (deleted.length === 0) return { deleted };
  await prisma.profile.deleteMany({ where: { id: { in: deleted } } });
  emitToAll('profiles:changed');
  await publishSingQueue();
  return { deleted };
}
