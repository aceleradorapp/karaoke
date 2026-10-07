import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { STALE_GUEST_DEFAULT_DAYS, createProfileSchema, deleteGuestsSchema, updateProfileSchema } from '@caraoke/shared';
import { z } from 'zod';
import { deleteGuests, listGuests, listStaleGuests } from './guests.js';
import { createProfile, deleteProfile, listProfiles, touchProfile, updateProfile } from './service.js';

const NO_CONTENT = 204;
const CREATED = 201;

const idParamsSchema = z.object({ id: z.string().min(1) });
const staleQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(3650).default(STALE_GUEST_DEFAULT_DAYS) });

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get('/profiles', async () => ({ items: await listProfiles() }));

  typedApp.get('/profiles/guests', async () => ({ items: await listGuests() }));

  typedApp.get('/profiles/guests/stale', { schema: { querystring: staleQuerySchema } }, async (request) => ({
    items: await listStaleGuests(request.query.days),
  }));

  typedApp.post('/profiles/guests/delete-many', { schema: { body: deleteGuestsSchema } }, async (request) =>
    deleteGuests(request.body.ids),
  );

  typedApp.post('/profiles', { schema: { body: createProfileSchema } }, async (request, reply) => {
    const input = request.isMobile
      ? { name: request.body.name, avatar: request.body.avatar, isGuest: true }
      : request.body;
    const profile = await createProfile(input);
    return reply.status(CREATED).send(profile);
  });

  typedApp.patch(
    '/profiles/:id',
    { schema: { params: idParamsSchema, body: updateProfileSchema } },
    async (request) => updateProfile(request.params.id, request.body),
  );

  typedApp.post('/profiles/:id/touch', { schema: { params: idParamsSchema } }, async (request) =>
    touchProfile(request.params.id),
  );

  typedApp.delete('/profiles/:id', { schema: { params: idParamsSchema } }, async (request, reply) => {
    await deleteProfile(request.params.id);
    return reply.status(NO_CONTENT).send();
  });
}
