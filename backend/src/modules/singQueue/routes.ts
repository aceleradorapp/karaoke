import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createSingRequestSchema, reorderSingQueueSchema } from '@caraoke/shared';
import { z } from 'zod';
import { addSingRequest, getSingQueue, removeSingRequest, reorderSingQueue } from './service.js';

const CREATED = 201;
const NO_CONTENT = 204;

const idParamsSchema = z.object({ id: z.string().min(1) });
const removeQuerySchema = z.object({ profileId: z.string().min(1).optional() });

export async function singQueueRoutes(app: FastifyInstance): Promise<void> {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get('/sing-queue', async () => getSingQueue());

  typedApp.post('/sing-queue', { schema: { body: createSingRequestSchema } }, async (request, reply) =>
    reply.status(CREATED).send(await addSingRequest(request.body, !request.isMobile)),
  );

  typedApp.put('/sing-queue/order', { schema: { body: reorderSingQueueSchema } }, async (request) =>
    reorderSingQueue(request.body.ids),
  );

  typedApp.delete(
    '/sing-queue/:id',
    { schema: { params: idParamsSchema, querystring: removeQuerySchema } },
    async (request, reply) => {
      const requesterProfileId = request.isMobile ? (request.query.profileId ?? '') : null;
      await removeSingRequest(request.params.id, requesterProfileId);
      return reply.status(NO_CONTENT).send();
    },
  );
}
