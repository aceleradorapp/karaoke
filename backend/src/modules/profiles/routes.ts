import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { createProfileSchema, updateProfileSchema } from '@caraoke/shared';
import { z } from 'zod';
import { createProfile, deleteProfile, listProfiles, touchProfile, updateProfile } from './service.js';

const NO_CONTENT = 204;
const CREATED = 201;

const idParamsSchema = z.object({ id: z.string().min(1) });

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get('/profiles', async () => ({ items: await listProfiles() }));

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
