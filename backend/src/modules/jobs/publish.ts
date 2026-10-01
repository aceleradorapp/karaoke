import { prisma } from '../../db.js';
import { emitToAll } from '../../realtime.js';
import { toJobDTO, toSongDTO } from '../songs/mapper.js';

interface PublishOptions {
  includeSong?: boolean;
}

export async function publishJob(jobId: string, options: PublishOptions = {}): Promise<void> {
  const job = await prisma.job.findUnique({ where: { id: jobId }, include: { song: true } });
  if (!job) return;

  emitToAll('job:updated', toJobDTO(job, job.song));
  if (options.includeSong) emitToAll('song:updated', toSongDTO(job.song, job));
}
