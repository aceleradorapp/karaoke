import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { updateSettingsSchema } from '@caraoke/shared';
import { getAppSettings, updateAppSettings } from './service.js';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get('/settings', async () => getAppSettings());

  typedApp.patch('/settings', { schema: { body: updateSettingsSchema } }, async (request) =>
    updateAppSettings(request.body),
  );
}
