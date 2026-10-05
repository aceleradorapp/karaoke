import { Prisma } from '@prisma/client';
import type { AppSettings, CreateSingRequestInput, SingQueueResponse, SingRequestDTO } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { emitToAll } from '../../realtime.js';
import { AppError, conflict, notFound } from '../../utils/errors.js';
import { competitionVisibilityFilter, runningCompetition } from '../competitions/service.js';
import { getAppSettings } from '../settings/service.js';
import { LATEST_JOB, toListedSongDTO } from '../songs/service.js';

const FORBIDDEN = 403;
const UNIQUE_CONSTRAINT_FAILED = 'P2002';
const NO_LIMIT = 0;

const QUEUE_ORDER: Prisma.SingRequestOrderByWithRelationInput[] = [{ position: 'asc' }, { createdAt: 'asc' }];

let shuffledPick: string | null = null;

function queueInclude() {
  return { profile: true, song: { include: LATEST_JOB } } satisfies Prisma.SingRequestInclude;
}

type SingRequestWithRelations = Prisma.SingRequestGetPayload<{ include: ReturnType<typeof queueInclude> }>;

function toSingRequestDTO(request: SingRequestWithRelations): SingRequestDTO {
  return {
    id: request.id,
    position: request.position,
    createdAt: request.createdAt.toISOString(),
    profile: {
      id: request.profile.id,
      name: request.profile.name,
      avatar: request.profile.avatar,
      isGuest: request.profile.isGuest,
    },
    song: toListedSongDTO(request.song, null),
  };
}

function alreadyRequested() {
  return conflict('ALREADY_REQUESTED', 'Esta música já está na sua fila');
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_FAILED;
}

async function lastSingerId(): Promise<string | null> {
  const last = await prisma.performance.findFirst({
    orderBy: { startedAt: 'desc' },
    select: { profileId: true },
  });
  return last?.profileId ?? null;
}

export function pickNext(
  items: SingRequestDTO[],
  isShuffled: boolean,
  previousPick: string | null,
  avoidProfileId: string | null,
  random: () => number = Math.random,
): string | null {
  const ready = items.filter((request) => request.song.status === 'READY');
  if (ready.length === 0) return null;
  if (!isShuffled) return ready[0]?.id ?? null;
  if (previousPick && ready.some((request) => request.id === previousPick)) return previousPick;
  const others = ready.filter((request) => request.profile.id !== avoidProfileId);
  const candidates = others.length > 0 ? others : ready;
  return candidates[Math.floor(random() * candidates.length)]?.id ?? null;
}

export async function getSingQueue(): Promise<SingQueueResponse> {
  const [running, settings] = await Promise.all([runningCompetition(), getAppSettings()]);
  const requests = await prisma.singRequest.findMany({
    where: competitionVisibilityFilter(running),
    orderBy: QUEUE_ORDER,
    include: queueInclude(),
  });
  const items = requests.map(toSingRequestDTO);
  const isShuffled = running ? running.shuffle : settings['queue.shuffle'];
  const nextId = pickNext(items, isShuffled, shuffledPick, isShuffled ? await lastSingerId() : null);
  shuffledPick = isShuffled ? nextId : null;
  return {
    items,
    nextId,
    competition: running ? { id: running.id, name: running.name } : null,
    autoAdvanceSeconds: running ? running.autoAdvanceSeconds : settings['queue.autoAdvanceSeconds'],
  };
}

export async function publishSingQueue(): Promise<SingQueueResponse> {
  const queue = await getSingQueue();
  emitToAll('singQueue:changed', queue);
  return queue;
}

async function assertCanRequest(input: CreateSingRequestInput): Promise<void> {
  const [profile, song] = await Promise.all([
    prisma.profile.findUnique({ where: { id: input.profileId }, select: { id: true } }),
    prisma.song.findUnique({ where: { id: input.songId }, select: { status: true } }),
  ]);
  if (!profile) throw notFound('PROFILE_NOT_FOUND', 'Perfil não encontrado');
  if (!song) throw notFound('SONG_NOT_FOUND', 'Música não encontrada');
  if (song.status === 'ERROR') {
    throw conflict('SONG_UNAVAILABLE', 'Esta música falhou no processamento e não pode ser cantada');
  }
}

function limitFor(settings: AppSettings, isFromStage: boolean): number {
  if (isFromStage && settings['queue.stageBypassesLimit']) return NO_LIMIT;
  return settings['queue.maxRequestsPerPerson'];
}

export async function addSingRequest(
  input: CreateSingRequestInput,
  isFromStage = false,
): Promise<SingRequestDTO> {
  await assertCanRequest(input);
  const limit = limitFor(await getAppSettings(), isFromStage);

  const created = await prisma
    .$transaction(async (transaction) => {
      const mine = await transaction.singRequest.findMany({
        where: { profileId: input.profileId, competitionId: null },
        select: { songId: true },
      });
      if (mine.some((request) => request.songId === input.songId)) throw alreadyRequested();
      if (limit !== NO_LIMIT && mine.length >= limit) {
        throw conflict(
          'TOO_MANY_REQUESTS',
          `Você já tem ${limit} ${limit === 1 ? 'música' : 'músicas'} na fila. Espere cantar uma delas.`,
        );
      }
      const last = await transaction.singRequest.aggregate({ _max: { position: true } });
      return transaction.singRequest.create({
        data: { profileId: input.profileId, songId: input.songId, position: (last._max.position ?? 0) + 1 },
        include: queueInclude(),
      });
    })
    .catch((error: unknown) => {
      throw isUniqueViolation(error) ? alreadyRequested() : error;
    });

  await publishSingQueue();
  return toSingRequestDTO(created);
}

export async function removeSingRequest(id: string, requesterProfileId: string | null): Promise<void> {
  const request = await prisma.singRequest.findUnique({ where: { id }, select: { profileId: true } });
  if (!request) throw notFound('SING_REQUEST_NOT_FOUND', 'Este pedido não está mais na fila');
  if (requesterProfileId !== null && request.profileId !== requesterProfileId) {
    throw new AppError('NOT_YOUR_REQUEST', 'Você só pode tirar os seus pedidos', FORBIDDEN);
  }

  await prisma.singRequest.deleteMany({ where: { id } });
  await publishSingQueue();
}

export async function reorderSingQueue(ids: string[]): Promise<SingQueueResponse> {
  await prisma.$transaction(async (transaction) => {
    const current = await transaction.singRequest.findMany({
      where: competitionVisibilityFilter(await runningCompetition()),
      orderBy: QUEUE_ORDER,
      select: { id: true },
    });
    const currentIds = current.map((request) => request.id);
    const requested = [...new Set(ids)].filter((id) => currentIds.includes(id));
    const ordered = [...requested, ...currentIds.filter((id) => !requested.includes(id))];

    for (const [index, id] of ordered.entries()) {
      await transaction.singRequest.update({ where: { id }, data: { position: index + 1 } });
    }
  });

  return publishSingQueue();
}
