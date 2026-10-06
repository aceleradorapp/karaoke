import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getProcessingEstimate } from './estimate.js';
import { setJobTarget } from './remoteService.js';
import { cancelJob, deleteFinishedJob, listJobs, reorderJobs, retryJob } from './queueService.js';

const NO_CONTENT = 204;

const listQuerySchema = z.object({ scope: z.enum(['active', 'recent']).default('active') });
const reorderBodySchema = z.object({ ids: z.array(z.string().min(1)).max(500) });
const idParamsSchema = z.object({ id: z.string().min(1) });
const targetBodySchema = z.object({ targetWorkerId: z.string().min(1).max(40).nullable() });

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get('/jobs', { schema: { querystring: listQuerySchema } }, async (request) => ({
    items: await listJobs(request.query.scope),
  }));

  typedApp.get('/jobs/estimate', async () => getProcessingEstimate());

  typedApp.patch('/jobs/reorder', { schema: { body: reorderBodySchema } }, async (request) => ({
    ids: await reorderJobs(request.body.ids),
  }));

  typedApp.post('/jobs/:id/cancel', { schema: { params: idParamsSchema } }, async (request, reply) => {
    await cancelJob(request.params.id);
    return reply.status(NO_CONTENT).send();
  });

  typedApp.patch(
    '/jobs/:id/target',
    { schema: { params: idParamsSchema, body: targetBodySchema } },
    async (request, reply) => {
      await setJobTarget(request.params.id, request.body.targetWorkerId);
      return reply.status(NO_CONTENT).send();
    },
  );

  typedApp.post('/jobs/:id/retry', { schema: { params: idParamsSchema } }, async (request) =>
    retryJob(request.params.id),
  );

  typedApp.delete('/jobs/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
    await deleteFinishedJob(request.params.id);
    return reply.status(NO_CONTENT).send();
  });
}
