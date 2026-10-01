import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  addPlaylistItemSchema,
  createPlaylistSchema,
  reorderPlaylistSchema,
  updatePlaylistSchema,
} from '@caraoke/shared';
import { z } from 'zod';
import {
  addItem,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  listPlaylists,
  removeItem,
  renamePlaylist,
  reorderItems,
} from './service.js';

const CREATED = 201;
const NO_CONTENT = 204;

const idParamsSchema = z.object({ id: z.string().min(1) });
const profileParamsSchema = z.object({ profileId: z.string().min(1) });
const itemParamsSchema = z.object({ id: z.string().min(1), songId: z.string().min(1) });
const listQuerySchema = z.object({ songId: z.string().min(1).optional() });

export async function playlistRoutes(app: FastifyInstance): Promise<void> {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/profiles/:profileId/playlists',
    { schema: { params: profileParamsSchema, querystring: listQuerySchema } },
    async (request) => listPlaylists(request.params.profileId, request.query.songId),
  );

  typedApp.post(
    '/profiles/:profileId/playlists',
    { schema: { params: profileParamsSchema, body: createPlaylistSchema } },
    async (request, reply) =>
      reply.status(CREATED).send(await createPlaylist(request.params.profileId, request.body.name)),
  );

  typedApp.get('/playlists/:id', { schema: { params: idParamsSchema } }, async (request) =>
    getPlaylist(request.params.id),
  );

  typedApp.patch(
    '/playlists/:id',
    { schema: { params: idParamsSchema, body: updatePlaylistSchema } },
    async (request) => renamePlaylist(request.params.id, request.body.name),
  );

  typedApp.delete('/playlists/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
    await deletePlaylist(request.params.id);
    return reply.status(NO_CONTENT).send();
  });

  typedApp.post(
    '/playlists/:id/items',
    { schema: { params: idParamsSchema, body: addPlaylistItemSchema } },
    async (request, reply) => {
      await addItem(request.params.id, request.body.songId);
      return reply.status(NO_CONTENT).send();
    },
  );

  typedApp.delete(
    '/playlists/:id/items/:songId',
    { schema: { params: itemParamsSchema } },
    async (request, reply) => {
      await removeItem(request.params.id, request.params.songId);
      return reply.status(NO_CONTENT).send();
    },
  );

  typedApp.patch(
    '/playlists/:id/items/reorder',
    { schema: { params: idParamsSchema, body: reorderPlaylistSchema } },
    async (request, reply) => {
      await reorderItems(request.params.id, request.body);
      return reply.status(NO_CONTENT).send();
    },
  );
}
