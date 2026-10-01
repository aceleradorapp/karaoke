import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createPerformanceSchema, finishPerformanceSchema } from '@caraoke/shared';
import { z } from 'zod';
import { finishPerformance, startPerformance } from './service.js';

const CREATED = 201;
const idParamsSchema = z.object({ id: z.string().min(1) });

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
}
