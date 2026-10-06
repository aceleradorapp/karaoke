import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { checkLyrics } from './service.js';

const MAX_TEXT_LENGTH = 200;
const MAX_DURATION_SEC = 6 * 60 * 60;

const checkQuerySchema = z.object({
  artist: z.string().trim().max(MAX_TEXT_LENGTH).default(''),
  title: z.string().trim().min(1, 'Informe o título').max(MAX_TEXT_LENGTH),
  duration: z.coerce.number().int().positive().max(MAX_DURATION_SEC).optional(),
});

export async function lyricsCheckRoutes(app: FastifyInstance): Promise<void> {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get('/lyrics/check', { schema: { querystring: checkQuerySchema } }, async (request) => {
    const { artist, title, duration } = request.query;
    return { status: await checkLyrics({ artist, title, ...(duration ? { durationSec: duration } : {}) }) };
  });
}
