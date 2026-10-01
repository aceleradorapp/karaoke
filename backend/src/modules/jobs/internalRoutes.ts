import type { FastifyInstance } from 'fastify';
import { claimNextJob } from './service.js';

const NO_CONTENT = 204;

export async function jobsInternalRoutes(app: FastifyInstance): Promise<void> {
  app.post('/internal/jobs/claim', async (_request, reply) => {
    const claim = await claimNextJob();
    if (!claim) return reply.status(NO_CONTENT).send();
    return claim;
  });
}
