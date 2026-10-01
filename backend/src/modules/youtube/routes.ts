import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { searchVideos } from './service.js';

const DEFAULT_RESULT_LIMIT = 12;
const MAX_RESULT_LIMIT = 25;
const MAX_QUERY_LENGTH = 100;

const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Informe o que buscar').max(MAX_QUERY_LENGTH),
  limit: z.coerce.number().int().min(1).max(MAX_RESULT_LIMIT).default(DEFAULT_RESULT_LIMIT),
});

export async function youtubeRoutes(app: FastifyInstance): Promise<void> {
  app
    .withTypeProvider<ZodTypeProvider>()
    .get('/youtube/search', { schema: { querystring: searchQuerySchema } }, async (request) => ({
      items: await searchVideos(request.query.q, request.query.limit),
    }));
}
