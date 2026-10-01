import { prisma } from '../src/db.js';

export async function resetDatabase(): Promise<void> {
  await prisma.vote.deleteMany();
  await prisma.performance.deleteMany();
  await prisma.playlistItem.deleteMany();
  await prisma.playlist.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.job.deleteMany();
  await prisma.song.deleteMany();
  await prisma.profile.deleteMany();
  await prisma.setting.deleteMany();
}
