import fs from 'node:fs/promises';
import path from 'node:path';
import type { Competition, Prisma } from '@prisma/client';
import type {
  AppSettings,
  CompetitionDTO,
  CompetitionRules,
  CompetitionScoreRow,
  CompetitionSummary,
  CreateCompetitionInput,
  RankingProfile,
  UpdateCompetitionInput,
} from '@caraoke/shared';
import { prisma } from '../../db.js';
import { emitToAll } from '../../realtime.js';
import { resolveInside, songFile, storagePaths } from '../../services/storage.js';
import { conflict, notFound } from '../../utils/errors.js';
import { getAppSettings } from '../settings/service.js';
import { publishSingQueue } from '../singQueue/service.js';
import { LATEST_JOB, toListedSongDTO } from '../songs/service.js';

type ScoringMode = AppSettings['scoring.mode'];

const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const IMAGE_MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function competitionNotFound() {
  return notFound('COMPETITION_NOT_FOUND', 'Disputa não encontrada');
}

function notDraft() {
  return conflict(
    'COMPETITION_NOT_EDITABLE',
    'Esta disputa já começou: não dá para mudar os participantes nem as músicas',
  );
}

function imageUrlOf(competition: Competition): string | null {
  return competition.imageExt
    ? `/api/competitions/${competition.id}/image?v=${competition.updatedAt.getTime()}`
    : null;
}

export function imagePathOf(competition: Pick<Competition, 'id' | 'imageExt'>): string | null {
  return competition.imageExt
    ? resolveInside(storagePaths.competitionsDir, `${competition.id}.${competition.imageExt}`)
    : null;
}

function toRankingProfile(profile: {
  id: string;
  name: string;
  avatar: string;
  isGuest: boolean;
}): RankingProfile {
  return { id: profile.id, name: profile.name, avatar: profile.avatar, isGuest: profile.isGuest };
}

function rulesOf(competition: Competition): CompetitionRules {
  return {
    songsPerParticipant: competition.songsPerParticipant,
    scoringMode: competition.scoringMode as ScoringMode,
    voteSeconds: competition.voteSeconds,
    autoAdvanceSeconds: competition.autoAdvanceSeconds,
    shuffle: competition.shuffle,
  };
}

function toSummary(competition: Competition, participantsCount: number): CompetitionSummary {
  return {
    id: competition.id,
    name: competition.name,
    status: competition.status,
    imageUrl: imageUrlOf(competition),
    participantsCount,
    createdAt: competition.createdAt.toISOString(),
    startedAt: competition.startedAt?.toISOString() ?? null,
    finishedAt: competition.finishedAt?.toISOString() ?? null,
  };
}

function announce(id: string): void {
  emitToAll('competition:changed', { id });
}

async function findOrThrow(id: string): Promise<Competition> {
  const competition = await prisma.competition.findUnique({ where: { id } });
  if (!competition) throw competitionNotFound();
  return competition;
}

async function findDraftOrThrow(id: string): Promise<Competition> {
  const competition = await findOrThrow(id);
  if (competition.status !== 'DRAFT') throw notDraft();
  return competition;
}

export function rankScoreboard(rows: CompetitionScoreRow[]): CompetitionScoreRow[] {
  return [...rows].sort((a, b) => {
    if (a.avg === null && b.avg === null) return 0;
    if (a.avg === null) return 1;
    if (b.avg === null) return -1;
    return b.avg - a.avg || (b.best ?? 0) - (a.best ?? 0);
  });
}

async function scoreboardOf(
  competition: Competition,
  participants: Array<{ profile: RankingProfile; total: number }>,
) {
  const performances = await prisma.performance.findMany({
    where: { competitionId: competition.id, finishedAt: { not: null } },
    select: { profileId: true, finalScore: true },
  });
  return rankScoreboard(
    participants.map(({ profile, total }) => {
      const mine = performances.filter((performance) => performance.profileId === profile.id);
      const scores = mine
        .map((performance) => performance.finalScore)
        .filter((score): score is number => score !== null);
      return {
        profile,
        avg: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
        best: scores.length ? Math.max(...scores) : null,
        sung: mine.length,
        total,
      };
    }),
  );
}

export async function listCompetitions(): Promise<CompetitionSummary[]> {
  const competitions = await prisma.competition.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { participants: true } } },
  });
  return competitions.map((competition) => toSummary(competition, competition._count.participants));
}

export async function getCompetition(id: string): Promise<CompetitionDTO> {
  const competition = await findOrThrow(id);
  const [participants, songs] = await Promise.all([
    prisma.competitionParticipant.findMany({
      where: { competitionId: id },
      orderBy: { position: 'asc' },
      include: { profile: true },
    }),
    prisma.competitionSong.findMany({
      where: { competitionId: id },
      orderBy: { position: 'asc' },
      include: { song: { include: LATEST_JOB } },
    }),
  ]);
  const participantDTOs = participants.map((participant) => ({
    profile: toRankingProfile(participant.profile),
    position: participant.position,
    songs: songs
      .filter((entry) => entry.profileId === participant.profileId)
      .map((entry) => ({ id: entry.id, song: toListedSongDTO(entry.song, null) })),
  }));

  return {
    ...toSummary(competition, participants.length),
    rules: rulesOf(competition),
    participants: participantDTOs,
    scoreboard: await scoreboardOf(
      competition,
      participantDTOs.map((participant) => ({
        profile: participant.profile,
        total: participant.songs.length,
      })),
    ),
  };
}

export async function createCompetition(input: CreateCompetitionInput): Promise<CompetitionDTO> {
  const settings = await getAppSettings();
  const competition = await prisma.competition.create({
    data: {
      name: input.name,
      scoringMode: settings['scoring.mode'],
      voteSeconds: settings['scoring.voteSeconds'],
      autoAdvanceSeconds: settings['queue.autoAdvanceSeconds'],
    },
  });
  announce(competition.id);
  return getCompetition(competition.id);
}

export async function updateCompetition(
  id: string,
  changes: UpdateCompetitionInput,
): Promise<CompetitionDTO> {
  const competition = await findOrThrow(id);
  const changesRules = Object.keys(changes).some((key) => key !== 'name');
  if (changesRules && competition.status === 'FINISHED') {
    throw conflict('COMPETITION_FINISHED', 'Esta disputa já terminou');
  }
  if (changes.songsPerParticipant !== undefined && competition.status !== 'DRAFT') throw notDraft();
  await prisma.competition.update({ where: { id }, data: changes });
  announce(id);
  if (competition.status === 'RUNNING') await publishSingQueue();
  return getCompetition(id);
}

export async function setParticipants(id: string, profileIds: string[]): Promise<CompetitionDTO> {
  await findDraftOrThrow(id);
  const unique = [...new Set(profileIds)];
  const found = await prisma.profile.count({ where: { id: { in: unique } } });
  if (found !== unique.length) throw notFound('PROFILE_NOT_FOUND', 'Perfil não encontrado');

  await prisma.$transaction([
    prisma.competitionSong.deleteMany({ where: { competitionId: id, profileId: { notIn: unique } } }),
    prisma.competitionParticipant.deleteMany({ where: { competitionId: id } }),
    prisma.competitionParticipant.createMany({
      data: unique.map((profileId, index) => ({ competitionId: id, profileId, position: index + 1 })),
    }),
  ]);
  announce(id);
  return getCompetition(id);
}

export async function addCompetitionSong(
  id: string,
  profileId: string,
  songId: string,
): Promise<CompetitionDTO> {
  const competition = await findDraftOrThrow(id);
  const [participant, song, mine] = await Promise.all([
    prisma.competitionParticipant.findUnique({
      where: { competitionId_profileId: { competitionId: id, profileId } },
    }),
    prisma.song.findUnique({ where: { id: songId }, select: { status: true } }),
    prisma.competitionSong.findMany({ where: { competitionId: id, profileId }, select: { songId: true } }),
  ]);
  if (!participant) throw notFound('PARTICIPANT_NOT_FOUND', 'Esta pessoa não está na disputa');
  if (!song) throw notFound('SONG_NOT_FOUND', 'Música não encontrada');
  if (song.status === 'ERROR') {
    throw conflict('SONG_UNAVAILABLE', 'Esta música falhou no processamento e não pode ser cantada');
  }
  if (mine.some((entry) => entry.songId === songId)) {
    throw conflict('ALREADY_IN_COMPETITION', 'Esta música já está na lista desta pessoa');
  }
  if (mine.length >= competition.songsPerParticipant) {
    throw conflict(
      'TOO_MANY_SONGS',
      `Cada pessoa canta ${competition.songsPerParticipant} ${competition.songsPerParticipant === 1 ? 'música' : 'músicas'} nesta disputa`,
    );
  }
  const last = await prisma.competitionSong.aggregate({
    where: { competitionId: id },
    _max: { position: true },
  });
  await prisma.competitionSong.create({
    data: { competitionId: id, profileId, songId, position: (last._max.position ?? 0) + 1 },
  });
  announce(id);
  return getCompetition(id);
}

export async function removeCompetitionSong(id: string, entryId: string): Promise<CompetitionDTO> {
  await findDraftOrThrow(id);
  await prisma.competitionSong.deleteMany({ where: { id: entryId, competitionId: id } });
  announce(id);
  return getCompetition(id);
}

export function roundRobin<T extends { profileId: string }>(participantIds: string[], songs: T[]): T[] {
  const byPerson = participantIds.map((profileId) => songs.filter((entry) => entry.profileId === profileId));
  const rounds = Math.max(0, ...byPerson.map((list) => list.length));
  const ordered: T[] = [];
  for (let round = 0; round < rounds; round += 1) {
    for (const list of byPerson) {
      const entry = list[round];
      if (entry) ordered.push(entry);
    }
  }
  return ordered;
}

export async function startCompetition(id: string): Promise<CompetitionDTO> {
  await findDraftOrThrow(id);
  const running = await prisma.competition.findFirst({ where: { status: 'RUNNING' }, select: { id: true } });
  if (running) throw conflict('COMPETITION_ALREADY_RUNNING', 'Já existe uma disputa em andamento');

  const [participants, songs] = await Promise.all([
    prisma.competitionParticipant.findMany({ where: { competitionId: id }, orderBy: { position: 'asc' } }),
    prisma.competitionSong.findMany({ where: { competitionId: id }, orderBy: { position: 'asc' } }),
  ]);
  if (participants.length < 2) {
    throw conflict('NOT_ENOUGH_PARTICIPANTS', 'A disputa precisa de pelo menos 2 participantes');
  }
  if (songs.length === 0) throw conflict('NO_SONGS', 'Escolha as músicas dos participantes antes de começar');

  const ordered = roundRobin(
    participants.map((participant) => participant.profileId),
    songs,
  );
  await prisma.$transaction([
    prisma.singRequest.createMany({
      data: ordered.map((entry, index) => ({
        profileId: entry.profileId,
        songId: entry.songId,
        competitionId: id,
        position: index + 1,
      })),
    }),
    prisma.competition.update({ where: { id }, data: { status: 'RUNNING', startedAt: new Date() } }),
  ]);
  announce(id);
  await publishSingQueue();
  return getCompetition(id);
}

export async function finishCompetition(id: string): Promise<CompetitionDTO> {
  const competition = await findOrThrow(id);
  if (competition.status !== 'RUNNING') {
    throw conflict('COMPETITION_NOT_RUNNING', 'Esta disputa não está em andamento');
  }
  await prisma.$transaction([
    prisma.singRequest.deleteMany({ where: { competitionId: id } }),
    prisma.competition.update({ where: { id }, data: { status: 'FINISHED', finishedAt: new Date() } }),
  ]);
  announce(id);
  await publishSingQueue();
  return getCompetition(id);
}

export async function deleteCompetition(id: string): Promise<void> {
  const competition = await findOrThrow(id);
  if (competition.status === 'RUNNING') {
    throw conflict('COMPETITION_RUNNING', 'Encerre a disputa antes de apagar');
  }
  await prisma.competition.delete({ where: { id } });
  const imagePath = imagePathOf(competition);
  if (imagePath) await fs.rm(imagePath, { force: true });
  announce(id);
}

async function replaceImage(competition: Competition, ext: string, write: (target: string) => Promise<void>) {
  const previous = imagePathOf(competition);
  const target = resolveInside(storagePaths.competitionsDir, `${competition.id}.${ext}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await write(target);
  if (previous && previous !== target) await fs.rm(previous, { force: true });
  await prisma.competition.update({ where: { id: competition.id }, data: { imageExt: ext } });
  announce(competition.id);
}

export function imageExtFor(mimeType: string): string | null {
  return IMAGE_TYPES[mimeType] ?? null;
}

export async function saveUploadedImage(id: string, ext: string, data: Buffer): Promise<CompetitionDTO> {
  const competition = await findOrThrow(id);
  await replaceImage(competition, ext, (target) => fs.writeFile(target, data));
  return getCompetition(id);
}

export async function useSongCoverAsImage(id: string, songId: string): Promise<CompetitionDTO> {
  const competition = await findOrThrow(id);
  const song = await prisma.song.findUnique({ where: { id: songId }, select: { hasCover: true } });
  if (!song?.hasCover) throw notFound('COVER_NOT_FOUND', 'Esta música não tem capa');
  await replaceImage(competition, 'jpg', (target) => fs.copyFile(songFile(songId, 'capa.jpg'), target));
  return getCompetition(id);
}

export async function removeImage(id: string): Promise<CompetitionDTO> {
  const competition = await findOrThrow(id);
  const previous = imagePathOf(competition);
  if (previous) await fs.rm(previous, { force: true });
  await prisma.competition.update({ where: { id }, data: { imageExt: null } });
  announce(id);
  return getCompetition(id);
}

export async function runningCompetition(): Promise<Competition | null> {
  return prisma.competition.findFirst({ where: { status: 'RUNNING' } });
}

export async function competitionRulesFor(competitionId: string | null): Promise<CompetitionRules | null> {
  if (!competitionId) return null;
  const competition = await prisma.competition.findUnique({ where: { id: competitionId } });
  return competition?.status === 'RUNNING' ? rulesOf(competition) : null;
}

export async function onCompetitionPerformanceScored(competitionId: string | null): Promise<void> {
  if (!competitionId) return;
  const competition = await prisma.competition.findUnique({ where: { id: competitionId } });
  if (competition?.status !== 'RUNNING') return;
  const remaining = await prisma.singRequest.count({ where: { competitionId } });
  if (remaining === 0) await finishCompetition(competitionId);
  else announce(competitionId);
}

export const competitionVisibilityFilter = (running: Competition | null): Prisma.SingRequestWhereInput =>
  running ? { competitionId: running.id } : { competitionId: null };
