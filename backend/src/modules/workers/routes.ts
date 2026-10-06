import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { pairWorkerSchema, renameWorkerSchema } from '@caraoke/shared';
import { z } from 'zod';
import { emitToRoom } from '../../realtime.js';
import { cancelPairing, listWorkers, pairWorker, renameWorker, revokeWorker, startPairing } from './service.js';

const CREATED = 201;
const NO_CONTENT = 204;

const idParamsSchema = z.object({ id: z.string().min(1) });

function announceChange(workerId: string): void {
  emitToRoom('stage', 'workers:changed', { workerId });
}

export async function workerRoutes(app: FastifyInstance): Promise<void> {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get('/workers', async () => ({ items: await listWorkers() }));

  typedApp.post('/workers/pairing', async (_request, reply) => reply.status(CREATED).send(startPairing()));

  typedApp.delete('/workers/pairing', async (_request, reply) => {
    cancelPairing();
    return reply.status(NO_CONTENT).send();
  });

  typedApp.post('/workers/pair', { schema: { body: pairWorkerSchema } }, async (request, reply) => {
    const result = await pairWorker(request.body);
    announceChange(result.workerId);
    return reply.status(CREATED).send(result);
  });

  typedApp.patch(
    '/workers/:id',
    { schema: { params: idParamsSchema, body: renameWorkerSchema } },
    async (request, reply) => {
      await renameWorker(request.params.id, request.body.name);
      announceChange(request.params.id);
      return reply.status(NO_CONTENT).send();
    },
  );

  typedApp.delete('/workers/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
    await revokeWorker(request.params.id);
    announceChange(request.params.id);
    return reply.status(NO_CONTENT).send();
  });
}
