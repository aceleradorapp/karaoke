import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { deleteManySongsSchema, saveLyricsSchema, singerKeySchema, updateSongSchema } from '@caraoke/shared';
import { z } from 'zod';
import { buildHome } from './home.js';
import { getOriginalLyrics, restoreOriginalLyrics, saveLyrics } from './lyrics.js';
import { enqueueResync } from '../jobs/resync.js';
import { getSingerKey, saveSingerKey } from './singerKey.js';
import { deleteManySongs, deleteSong, getSong, listSongs, updateSong } from './service.js';

const NO_CONTENT = 204;
const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;
const MAX_TEXT_LENGTH = 200;

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['QUEUED', 'PROCESSING', 'READY', 'ERROR']).optional(),
  artist: z.string().trim().max(MAX_TEXT_LENGTH).optional(),
  sort: z.enum(['recent', 'title', 'artist', 'popular']).default('recent'),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().min(1).optional(),
  profileId: z.string().min(1).optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });
const profileQuerySchema = z.object({ profileId: z.string().min(1).optional() });

export async function songRoutes(app: FastifyInstance): Promise<void> {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get('/songs', { schema: { querystring: listQuerySchema } }, async (request) =>
    listSongs(request.query),
  );

  typedApp.get('/songs/home', { schema: { querystring: profileQuerySchema } }, async (request) =>
    buildHome(request.query.profileId),
  );

  typedApp.get(
    '/songs/:id',
    { schema: { params: idParamsSchema, querystring: profileQuerySchema } },
    async (request) => getSong(request.params.id, request.query.profileId),
  );

  typedApp.patch(
    '/songs/:id',
    { schema: { params: idParamsSchema, body: updateSongSchema } },
    async (request) => updateSong(request.params.id, request.body),
  );

  typedApp.put(
    '/songs/:id/lyrics',
    { schema: { params: idParamsSchema, body: saveLyricsSchema } },
    async (request) => saveLyrics(request.params.id, request.body),
  );

  typedApp.get('/songs/:id/lyrics/original', { schema: { params: idParamsSchema } }, async (request) =>
    getOriginalLyrics(request.params.id),
  );

  typedApp.post('/songs/:id/lyrics/restore', { schema: { params: idParamsSchema } }, async (request) =>
    restoreOriginalLyrics(request.params.id),
  );

  typedApp.get(
    '/songs/:id/key',
    { schema: { params: idParamsSchema, querystring: z.object({ profileId: z.string().min(1) }) } },
    async (request) => ({ keyShift: await getSingerKey(request.params.id, request.query.profileId) }),
  );

  typedApp.put('/songs/:id/key', { schema: { params: idParamsSchema, body: singerKeySchema } }, async (request) => ({
    keyShift: await saveSingerKey(request.params.id, request.body),
  }));

  typedApp.post('/songs/:id/lyrics/resync', { schema: { params: idParamsSchema } }, async (request, reply) =>
    reply.status(201).send(await enqueueResync(request.params.id)),
  );

  typedApp.post('/songs/delete-many', { schema: { body: deleteManySongsSchema } }, async (request) =>
    deleteManySongs(request.body.ids),
  );

  typedApp.delete('/songs/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
    await deleteSong(request.params.id);
    return reply.status(NO_CONTENT).send();
  });
}
