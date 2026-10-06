import type { FastifyInstance } from 'fastify';
import { generateAiKey, getAiKeyStatus, revokeAiKey } from './service.js';

const CREATED = 201;
const NO_CONTENT = 204;

export async function aiKeyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ai-key', async () => getAiKeyStatus());

  app.post('/ai-key', async (_request, reply) => reply.status(CREATED).send(await generateAiKey()));

  app.delete('/ai-key', async (_request, reply) => {
    await revokeAiKey();
    return reply.status(NO_CONTENT).send();
  });
}
