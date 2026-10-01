import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createPerformanceSchema, finishPerformanceSchema } from '@caraoke/shared';
import { z } from 'zod';
import { finishPerformance, listHistory, startPerformance } from './service.js';

const CREATED = 201;
const DEFAULT_HISTORY_LIMIT = 30;
const MAX_HISTORY_LIMIT = 100;

const idParamsSchema = z.object({ id: z.string().min(1) });
const profileParamsSchema = z.object({ profileId: z.string().min(1) });
const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_HISTORY_LIMIT).default(DEFAULT_HISTORY_LIMIT),
  cursor: z.string().min(1).optional(),
});

export async function performanceRoutes(app: FastifyInstance): Promise<void> {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post('/performances', { schema: { body: createPerformanceSchema } }, async (request, reply) =>
    reply.status(CREATED).send(await startPerformance(request.body)),
  );

  typedApp.post(
    '/performances/:id/finish',
    { schema: { params: idParamsSchema, body: finishPerformanceSchema } },
    async (request) => finishPerformance(request.params.id, request.body),
  );

  typedApp.get(
    '/profiles/:profileId/history',
    { schema: { params: profileParamsSchema, querystring: historyQuerySchema } },
    async (request) => listHistory(request.params.profileId, request.query.limit, request.query.cursor),
  );
}
