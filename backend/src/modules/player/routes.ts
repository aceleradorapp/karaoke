import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { playerStateInputSchema } from '@caraoke/shared';
import { getPlayerState, updatePlayerState } from './service.js';

export async function playerRoutes(app: FastifyInstance): Promise<void> {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get('/player/state', async () => getPlayerState());

  typedApp.post('/player/state', { schema: { body: playerStateInputSchema } }, async (request) =>
    updatePlayerState(request.body),
  );

  typedApp.get('/system/time', async () => ({ now: Date.now() }));
}
