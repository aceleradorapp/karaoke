import { Prisma } from '@prisma/client';
import { MAX_VIDEO_DURATION_SECONDS, type ImportResultDTO, type ImportYoutubeInput } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { emitToAll } from '../../realtime.js';
import { AppError, notFound } from '../../utils/errors.js';
import { assertWorkerExists } from '../jobs/remoteService.js';
import { enqueueJob } from '../jobs/service.js';
import { toJobDTO, toSongDTO } from '../songs/mapper.js';

type ImportResult = ImportResultDTO;

function assertDurationAllowed(durationSec: number | undefined): void {
  if (durationSec !== undefined && durationSec > MAX_VIDEO_DURATION_SECONDS) {
    throw new AppError('VIDEO_TOO_LONG', 'O vídeo tem mais de 12 minutos', 400);
  }
}

async function assertProfileExists(profileId: string | undefined): Promise<void> {
  if (!profileId) return;
  const profile = await prisma.profile.findUnique({ where: { id: profileId }, select: { id: true } });
  if (!profile) throw notFound('PROFILE_NOT_FOUND', 'Perfil não encontrado');
}

async function findExisting(youtubeId: string): Promise<ImportResult | null> {
  const song = await prisma.song.findUnique({
    where: { youtubeId },
    include: { jobs: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!song) return null;
  return { song: toSongDTO(song, song.jobs[0] ?? null), alreadyExists: true };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function createSongAndJob(input: ImportYoutubeInput): Promise<ImportResult> {
  const { song, job } = await prisma.$transaction(async (transaction) => {
    const created = await transaction.song.create({
      data: {
        title: input.title,
        artist: input.artist,
        source: 'YOUTUBE',
        youtubeId: input.youtubeId,
        durationSec: input.durationSec ?? null,
        addedById: input.profileId ?? null,
      },
    });
    const queued = await enqueueJob(transaction, created.id, null, input.targetWorkerId ?? null);
    return { song: created, job: queued };
  });

  const dto = toSongDTO(song, job);
  emitToAll('song:updated', dto);
  emitToAll('job:updated', toJobDTO(job, song));
  return { song: dto, alreadyExists: false };
}

export async function importFromYoutube(input: ImportYoutubeInput): Promise<ImportResult> {
  assertDurationAllowed(input.durationSec);

  const existing = await findExisting(input.youtubeId);
  if (existing) return existing;

  await assertProfileExists(input.profileId);
  if (input.targetWorkerId) await assertWorkerExists(input.targetWorkerId);

  try {
    return await createSongAndJob(input);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const winner = await findExisting(input.youtubeId);
    if (winner) return winner;
    throw error;
  }
}
