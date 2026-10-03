import type { JobStep, LyricsSource } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { deleteOriginFile, deleteSongDir, moveToError } from '../../services/storage.js';
import { notFound } from '../../utils/errors.js';
import { publishJob } from './publish.js';
import { publishSingQueue } from '../singQueue/service.js';

const PROGRESS_PUBLISH_INTERVAL_MS = 500;
const MAX_PROGRESS = 100;

export interface ProgressInput {
  step: JobStep;
  progress: number;
  message: string | null;
  device?: string;
}

export interface CompleteInput {
  durationSec: number | null;
  hasInstrumental: boolean;
  hasVocals: boolean;
  hasCover: boolean;
  hasMelody: boolean;
  lyricsSource: LyricsSource;
  lyricsNeedsReview: boolean;
  lyricsOffsetMs?: number;
}

export interface FailInput {
  error: string;
  step?: JobStep;
}

interface PublishState {
  at: number;
  step: JobStep;
}

const lastPublished = new Map<string, PublishState>();

function jobNotFound() {
  return notFound('JOB_NOT_FOUND', 'Job não encontrado');
}

function shouldPublishProgress(jobId: string, input: ProgressInput, now: number): boolean {
  const previous = lastPublished.get(jobId);
  const isDue = !previous || now - previous.at >= PROGRESS_PUBLISH_INTERVAL_MS;
  const changedStep = previous?.step !== input.step;
  return isDue || changedStep || input.progress >= MAX_PROGRESS;
}

export async function recordProgress(
  id: string,
  input: ProgressInput,
  now: number = Date.now(),
): Promise<{ cancel: boolean }> {
  const job = await prisma.job.findUnique({ where: { id }, select: { status: true } });
  if (!job || job.status !== 'RUNNING') return { cancel: true };

  await prisma.job.update({
    where: { id },
    data: {
      step: input.step,
      progress: input.progress,
      message: input.message,
      ...(input.device ? { device: input.device } : {}),
    },
  });

  if (shouldPublishProgress(id, input, now)) {
    lastPublished.set(id, { at: now, step: input.step });
    await publishJob(id);
  }
  return { cancel: false };
}

async function discardResultsOfCanceledJob(songId: string, sourcePath: string | null): Promise<void> {
  await deleteSongDir(songId);
  if (!sourcePath) return;

  const moved = await moveToError(sourcePath);
  if (moved) await prisma.job.updateMany({ where: { songId, sourcePath }, data: { sourcePath: moved } });
}

export async function completeJob(id: string, input: CompleteInput): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) throw jobNotFound();

  if (job.status !== 'RUNNING') {
    await discardResultsOfCanceledJob(job.songId, job.sourcePath);
    return;
  }

  await prisma.$transaction([
    prisma.job.update({
      where: { id },
      data: {
        status: 'DONE',
        step: 'FINALIZE',
        progress: MAX_PROGRESS,
        message: null,
        finishedAt: new Date(),
      },
    }),
    prisma.song.update({
      where: { id: job.songId },
      data: {
        status: 'READY',
        durationSec: input.durationSec,
        hasInstrumental: input.hasInstrumental,
        hasVocals: input.hasVocals,
        hasCover: input.hasCover,
        hasMelody: input.hasMelody,
        lyricsSource: input.lyricsSource,
        lyricsNeedsReview: input.lyricsNeedsReview,
        ...(input.lyricsOffsetMs === undefined ? {} : { lyricsOffsetMs: input.lyricsOffsetMs }),
      },
    }),
  ]);

  lastPublished.delete(id);
  await deleteOriginFile(job.sourcePath);
  await publishJob(id, { includeSong: true });
  await publishSingQueue();
}

export async function failJob(id: string, input: FailInput): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) throw jobNotFound();

  const isRunning = job.status === 'RUNNING';
  const isCanceled = job.status === 'CANCELED';
  if (!isRunning && !isCanceled) return;

  const movedSource = job.sourcePath ? await moveToError(job.sourcePath) : null;
  const sourceUpdate = movedSource ? { sourcePath: movedSource } : {};

  if (isCanceled) {
    await prisma.job.update({ where: { id }, data: sourceUpdate });
    return;
  }

  await prisma.$transaction([
    prisma.job.update({
      where: { id },
      data: {
        status: 'FAILED',
        error: input.error,
        message: null,
        finishedAt: new Date(),
        ...(input.step ? { step: input.step } : {}),
        ...sourceUpdate,
      },
    }),
    prisma.song.update({ where: { id: job.songId }, data: { status: 'ERROR' } }),
  ]);

  lastPublished.delete(id);
  await publishJob(id, { includeSong: true });
}
