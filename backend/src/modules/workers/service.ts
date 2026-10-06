import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { PairingCodeDTO, PairResultDTO, PairWorkerInput, ProcessingWorkerDTO } from '@caraoke/shared';
import { prisma } from '../../db.js';
import {
  forgetWorker,
  getWorkerInfo,
  LOCAL_WORKER_ID,
} from '../../services/workerStatus.js';
import {
  forgetWorkerName,
  LOCAL_WORKER_NAME,
  rememberWorkerName,
  replaceWorkerNames,
} from '../../services/workerNames.js';
import { conflict, notFound, unauthorized } from '../../utils/errors.js';
import { serverUrls } from '../aiKey/service.js';
import { publishJob } from '../jobs/publish.js';
import { recoverInterruptedJobs } from '../jobs/recovery.js';

export const PROCESSOR_DOWNLOAD_PATH = '/downloads/Processador-do-Karaoke.zip';

const PAIRING_TTL_MS = 10 * 60 * 1000;
const MAX_PAIRING_FAILURES = 5;
const PAIRING_CODE_DIGITS = 6;
const TOKEN_PREFIX = 'cw_';
const TOKEN_BYTES = 32;
const LAST_SEEN_SAVE_INTERVAL_MS = 60_000;

interface Pairing {
  code: string;
  expiresAt: number;
  failures: number;
}

let pairing: Pairing | null = null;
const lastSeenSavedAt = new Map<string, number>();

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function workerNotFound() {
  return notFound('WORKER_NOT_FOUND', 'Máquina não encontrada');
}

export async function loadWorkerNames(): Promise<void> {
  replaceWorkerNames(await prisma.worker.findMany({ where: { revokedAt: null }, select: { id: true, name: true } }));
}

export function startPairing(now: number = Date.now()): PairingCodeDTO {
  const code = String(randomInt(10 ** PAIRING_CODE_DIGITS)).padStart(PAIRING_CODE_DIGITS, '0');
  pairing = { code, expiresAt: now + PAIRING_TTL_MS, failures: 0 };
  return {
    code,
    expiresAt: new Date(pairing.expiresAt).toISOString(),
    serverUrls: serverUrls(),
    downloadPath: PROCESSOR_DOWNLOAD_PATH,
  };
}

export function cancelPairing(): void {
  pairing = null;
}

export async function pairWorker(input: PairWorkerInput, now: number = Date.now()): Promise<PairResultDTO> {
  const current = pairing;
  if (!current || current.expiresAt <= now) {
    throw unauthorized('PAIRING_EXPIRED', 'Código vencido. Gere um novo no karaokê (Configurações › Máquinas).');
  }
  if (input.code !== current.code) {
    current.failures += 1;
    if (current.failures >= MAX_PAIRING_FAILURES) pairing = null;
    throw unauthorized('PAIRING_INVALID', 'Código errado. Confira o número na tela do karaokê.');
  }

  pairing = null;
  const token = `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('base64url')}`;
  const worker = await prisma.worker.create({ data: { name: input.name, tokenHash: hashToken(token) } });
  rememberWorkerName(worker.id, worker.name);
  return { workerId: worker.id, token, name: worker.name };
}

export async function findWorkerIdByToken(token: string, now: number = Date.now()): Promise<string | null> {
  const worker = await prisma.worker.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!worker || worker.revokedAt) return null;
  rememberWorkerName(worker.id, worker.name);
  const savedAt = lastSeenSavedAt.get(worker.id) ?? 0;
  if (now - savedAt >= LAST_SEEN_SAVE_INTERVAL_MS) {
    lastSeenSavedAt.set(worker.id, now);
    await prisma.worker.update({ where: { id: worker.id }, data: { lastSeenAt: new Date(now) } });
  }
  return worker.id;
}

export async function listWorkers(now: number = Date.now()): Promise<ProcessingWorkerDTO[]> {
  const [paired, running] = await Promise.all([
    prisma.worker.findMany({ where: { revokedAt: null }, orderBy: { createdAt: 'asc' } }),
    prisma.job.findMany({
      where: { status: 'RUNNING', workerId: { not: null } },
      select: { workerId: true, song: { select: { title: true } } },
    }),
  ]);
  const currentSongOf = (workerId: string) =>
    running.find((job) => job.workerId === workerId || (workerId === LOCAL_WORKER_ID && job.workerId === null))?.song
      .title ?? null;

  const toDTO = (id: string, name: string, isLocal: boolean, savedLastSeen: Date | null): ProcessingWorkerDTO => {
    const info = getWorkerInfo(now, id);
    return {
      id,
      name,
      isLocal,
      online: info.online,
      device: info.device,
      gpuName: info.gpuName,
      lastSeenAt: info.lastSeen ?? savedLastSeen?.toISOString() ?? null,
      currentSongTitle: currentSongOf(id),
    };
  };

  return [
    toDTO(LOCAL_WORKER_ID, LOCAL_WORKER_NAME, true, null),
    ...paired.map((worker) => toDTO(worker.id, worker.name, false, worker.lastSeenAt)),
  ];
}

async function findPairedOrThrow(id: string) {
  const worker = await prisma.worker.findUnique({ where: { id } });
  if (!worker || worker.revokedAt) throw workerNotFound();
  return worker;
}

export async function renameWorker(id: string, name: string): Promise<void> {
  if (id === LOCAL_WORKER_ID) throw conflict('WORKER_LOCAL', 'O nome deste PC não pode ser mudado');
  await findPairedOrThrow(id);
  await prisma.worker.update({ where: { id }, data: { name } });
  rememberWorkerName(id, name);
}

export async function revokeWorker(id: string, now: Date = new Date()): Promise<void> {
  if (id === LOCAL_WORKER_ID) throw conflict('WORKER_LOCAL', 'Este PC não pode ser removido');
  await findPairedOrThrow(id);
  await prisma.worker.update({ where: { id }, data: { revokedAt: now } });
  forgetWorkerName(id);
  forgetWorker(id);

  const targeted = await prisma.job.findMany({ where: { status: 'PENDING', targetWorkerId: id }, select: { id: true } });
  await prisma.job.updateMany({ where: { id: { in: targeted.map((job) => job.id) } }, data: { targetWorkerId: null } });
  const running = await prisma.job.findMany({ where: { status: 'RUNNING', workerId: id }, select: { id: true } });
  await recoverInterruptedJobs(id);
  for (const job of [...targeted, ...running]) await publishJob(job.id);
}

export async function recoverLostWorker(workerId: string): Promise<void> {
  const running = await prisma.job.findMany({
    where: { status: 'RUNNING', ...(workerId === LOCAL_WORKER_ID ? { OR: [{ workerId }, { workerId: null }] } : { workerId }) },
    select: { id: true },
  });
  if (running.length === 0) return;
  await recoverInterruptedJobs(workerId);
  for (const job of running) await publishJob(job.id);
}

export function resetPairing(): void {
  pairing = null;
  replaceWorkerNames([]);
  lastSeenSavedAt.clear();
}
