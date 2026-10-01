import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { addFavorite, listFavorites, removeFavorite } from './service.js';

const NO_CONTENT = 204;

const profileParamsSchema = z.object({ profileId: z.string().min(1) });
const favoriteParamsSchema = z.object({ profileId: z.string().min(1), songId: z.string().min(1) });

export async function favoriteRoutes(app: FastifyInstance): Promise<void> {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/profiles/:profileId/favorites',
    { schema: { params: profileParamsSchema } },
    async (request) => listFavorites(request.params.profileId),
  );

  typedApp.put(
    '/profiles/:profileId/favorites/:songId',
    { schema: { params: favoriteParamsSchema } },
    async (request, reply) => {
      await addFavorite(request.params.profileId, request.params.songId);
      return reply.status(NO_CONTENT).send();
    },
  );

  typedApp.delete(
    '/profiles/:profileId/favorites/:songId',
    { schema: { params: favoriteParamsSchema } },
    async (request, reply) => {
      await removeFavorite(request.params.profileId, request.params.songId);
      return reply.status(NO_CONTENT).send();
    },
  );
}
