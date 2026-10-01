import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { importYoutubeSchema } from '@caraoke/shared';
import { z } from 'zod';
import { importFromYoutube } from './importService.js';
import { searchVideos } from './service.js';

const DEFAULT_RESULT_LIMIT = 12;
const MAX_RESULT_LIMIT = 25;
const MAX_QUERY_LENGTH = 100;
const OK = 200;
const CREATED = 201;

const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Informe o que buscar').max(MAX_QUERY_LENGTH),
  limit: z.coerce.number().int().min(1).max(MAX_RESULT_LIMIT).default(DEFAULT_RESULT_LIMIT),
});

export async function youtubeRoutes(app: FastifyInstance): Promise<void> {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get('/youtube/search', { schema: { querystring: searchQuerySchema } }, async (request) => ({
    items: await searchVideos(request.query.q, request.query.limit),
  }));

  typedApp.post('/youtube/import', { schema: { body: importYoutubeSchema } }, async (request, reply) => {
    const result = await importFromYoutube(request.body);
    return reply.status(result.alreadyExists ? OK : CREATED).send(result);
  });
}
