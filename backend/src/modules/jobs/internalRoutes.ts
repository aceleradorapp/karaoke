import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { LYRICS_OFFSET_LIMIT_MS } from '@caraoke/shared';
import { z } from 'zod';
import { markSongMelody } from '../songs/service.js';
import { saveResultFiles, sourceFileOf } from './remoteService.js';
import { claimNextJob } from './service.js';
import { LOCAL_WORKER_ID } from '../../services/workerStatus.js';
import { completeJob, failJob, recordProgress } from './workerService.js';

const NO_CONTENT = 204;
const MAX_PROGRESS = 100;
const MAX_MESSAGE_LENGTH = 255;
const MAX_ERROR_LENGTH = 2000;
const MAX_DEVICE_LENGTH = 40;

const jobStepSchema = z.enum(['DOWNLOAD', 'SEPARATE', 'LYRICS', 'COVER', 'MELODY', 'FINALIZE', 'RESYNC']);
const idParamsSchema = z.object({ id: z.string().min(1) });

const progressBodySchema = z.object({
  step: jobStepSchema,
  progress: z.number().int().min(0).max(MAX_PROGRESS),
  message: z.string().max(MAX_MESSAGE_LENGTH).nullable(),
  device: z.string().max(MAX_DEVICE_LENGTH).optional(),
});

const completeBodySchema = z.object({
  durationSec: z.number().int().nonnegative().nullable(),
  hasInstrumental: z.boolean(),
  hasVocals: z.boolean(),
  hasCover: z.boolean(),
  hasMelody: z.boolean(),
  lyricsSource: z.enum(['NONE', 'LRCLIB', 'PLAIN', 'ALIGNED', 'TRANSCRIBED', 'MANUAL']),
  lyricsNeedsReview: z.boolean(),
  lyricsNotice: z.enum(['NOT_FOUND', 'SITE_UNREACHABLE']).nullable().optional(),
  lyricsOffsetMs: z.number().int().min(-LYRICS_OFFSET_LIMIT_MS).max(LYRICS_OFFSET_LIMIT_MS).optional(),
});

const failBodySchema = z.object({
  error: z.string().max(MAX_ERROR_LENGTH),
  step: jobStepSchema.optional(),
});

export async function jobsInternalRoutes(app: FastifyInstance): Promise<void> {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post('/internal/jobs/claim', async (request, reply) => {
    const claim = await claimNextJob(request.workerId ?? undefined);
    if (!claim) return reply.status(NO_CONTENT).send();
    return claim;
  });

  typedApp.patch(
    '/internal/jobs/:id/progress',
    { schema: { params: idParamsSchema, body: progressBodySchema } },
    async (request) => recordProgress(request.params.id, request.body),
  );

  typedApp.post(
    '/internal/jobs/:id/complete',
    { schema: { params: idParamsSchema, body: completeBodySchema } },
    async (request) => {
      await completeJob(request.params.id, request.body);
      return { ok: true };
    },
  );

  typedApp.get('/internal/jobs/:id/source', { schema: { params: idParamsSchema } }, async (request, reply) => {
    const sourcePath = await sourceFileOf(request.params.id, request.workerId ?? LOCAL_WORKER_ID);
    return reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${encodeURIComponent(path.basename(sourcePath))}"`)
      .send(fs.createReadStream(sourcePath));
  });

  typedApp.post('/internal/songs/:id/files', { schema: { params: idParamsSchema } }, async (request) => ({
    saved: await saveResultFiles(request.params.id, request.workerId ?? LOCAL_WORKER_ID, request.parts()),
  }));

  typedApp.post('/internal/songs/:id/melody', { schema: { params: idParamsSchema } }, async (request) => {
    await markSongMelody(request.params.id);
    return { ok: true };
  });

  typedApp.post(
    '/internal/jobs/:id/fail',
    { schema: { params: idParamsSchema, body: failBodySchema } },
    async (request) => {
      await failJob(request.params.id, request.body);
      return { ok: true };
    },
  );
}
