import { Prisma } from '@prisma/client';
import {
  MAX_SING_REQUESTS_PER_PROFILE,
  type CreateSingRequestInput,
  type SingRequestDTO,
} from '@caraoke/shared';
import { prisma } from '../../db.js';
import { emitToAll } from '../../realtime.js';
import { AppError, conflict, notFound } from '../../utils/errors.js';
import { LATEST_JOB, toListedSongDTO } from '../songs/service.js';

const FORBIDDEN = 403;
const UNIQUE_CONSTRAINT_FAILED = 'P2002';

const QUEUE_ORDER: Prisma.SingRequestOrderByWithRelationInput[] = [{ position: 'asc' }, { createdAt: 'asc' }];

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

export async function listSingQueue(): Promise<SingRequestDTO[]> {
  const requests = await prisma.singRequest.findMany({ orderBy: QUEUE_ORDER, include: queueInclude() });
  return requests.map(toSingRequestDTO);
}

export async function publishSingQueue(): Promise<void> {
  emitToAll('singQueue:changed', { items: await listSingQueue() });
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

export async function addSingRequest(input: CreateSingRequestInput): Promise<SingRequestDTO> {
  await assertCanRequest(input);

  const created = await prisma
    .$transaction(async (transaction) => {
      const mine = await transaction.singRequest.findMany({
        where: { profileId: input.profileId },
        select: { songId: true },
      });
      if (mine.some((request) => request.songId === input.songId)) throw alreadyRequested();
      if (mine.length >= MAX_SING_REQUESTS_PER_PROFILE) {
        throw conflict(
          'TOO_MANY_REQUESTS',
          `Você já tem ${MAX_SING_REQUESTS_PER_PROFILE} músicas na fila. Espere cantar uma delas.`,
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

export async function reorderSingQueue(ids: string[]): Promise<SingRequestDTO[]> {
  await prisma.$transaction(async (transaction) => {
    const current = await transaction.singRequest.findMany({ orderBy: QUEUE_ORDER, select: { id: true } });
    const currentIds = current.map((request) => request.id);
    const requested = [...new Set(ids)].filter((id) => currentIds.includes(id));
    const ordered = [...requested, ...currentIds.filter((id) => !requested.includes(id))];

    for (const [index, id] of ordered.entries()) {
      await transaction.singRequest.update({ where: { id }, data: { position: index + 1 } });
    }
  });

  const items = await listSingQueue();
  emitToAll('singQueue:changed', { items });
  return items;
}
