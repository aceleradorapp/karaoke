import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { LYRICS_OFFSET_LIMIT_MS } from '@caraoke/shared';
import { z } from 'zod';
import { markSongMelody } from '../songs/service.js';
import { claimNextJob } from './service.js';
import { completeJob, failJob, recordProgress } from './workerService.js';

const NO_CONTENT = 204;
const MAX_PROGRESS = 100;
const MAX_MESSAGE_LENGTH = 255;
const MAX_ERROR_LENGTH = 2000;
const MAX_DEVICE_LENGTH = 40;

const jobStepSchema = z.enum(['DOWNLOAD', 'SEPARATE', 'LYRICS', 'COVER', 'MELODY', 'FINALIZE']);
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
  lyricsOffsetMs: z.number().int().min(-LYRICS_OFFSET_LIMIT_MS).max(LYRICS_OFFSET_LIMIT_MS).optional(),
});

const failBodySchema = z.object({
  error: z.string().max(MAX_ERROR_LENGTH),
  step: jobStepSchema.optional(),
});

export async function jobsInternalRoutes(app: FastifyInstance): Promise<void> {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post('/internal/jobs/claim', async (_request, reply) => {
    const claim = await claimNextJob();
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
