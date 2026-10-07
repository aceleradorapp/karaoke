import fs from 'node:fs/promises';
import type { JobDTO, LyricsDoc } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { songFile } from '../../services/storage.js';
import { LOCAL_WORKER_ID } from '../../services/workerStatus.js';
import { conflict, notFound } from '../../utils/errors.js';
import { toJobDTO } from '../songs/mapper.js';
import { publishJob } from './publish.js';
import { RESYNC_KIND, nextQueuePosition } from './service.js';

const ACTIVE_STATUSES = ['PENDING', 'RUNNING'] as const;
const LYRICS_FILES = ['letra.original.json', 'letra.json'];

async function hasTimedLyrics(songId: string): Promise<boolean> {
  for (const name of LYRICS_FILES) {
    try {
      const doc = JSON.parse(await fs.readFile(songFile(songId, name), 'utf-8')) as LyricsDoc;
      if (doc.synced && doc.lines.length > 0) return true;
    } catch {
      continue;
    }
  }
  return false;
}

export async function enqueueResync(songId: string): Promise<JobDTO> {
  const song = await prisma.song.findUnique({ where: { id: songId } });
  if (!song) throw notFound('SONG_NOT_FOUND', 'Música não encontrada');

  const active = await prisma.job.findFirst({ where: { songId, status: { in: [...ACTIVE_STATUSES] } } });
  if (active) throw conflict('JOB_ALREADY_ACTIVE', 'Esta música já está na fila de processamento');
  if (song.status !== 'READY' || !song.hasVocals) {
    throw conflict('RESYNC_NOT_POSSIBLE', 'A música precisa estar pronta e com a voz separada');
  }
  if (!(await hasTimedLyrics(songId))) {
    throw conflict('RESYNC_NOT_POSSIBLE', 'A letra desta música não tem tempos para sincronizar');
  }

  const job = await prisma.$transaction(async (transaction) =>
    transaction.job.create({
      data: {
        songId,
        kind: RESYNC_KIND,
        position: await nextQueuePosition(transaction),
        targetWorkerId: LOCAL_WORKER_ID,
      },
    }),
  );
  await publishJob(job.id);
  return toJobDTO(job, song);
}
