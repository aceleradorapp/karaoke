import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getAppSettings } from '../settings/service.js';
import { recordHeartbeat } from '../../services/workerStatus.js';

const heartbeatBodySchema = z.object({
  device: z.string(),
  cudaAvailable: z.boolean(),
  gpuName: z.string().nullable(),
  vramMb: z.number().nullable(),
  ytdlpVersion: z.string().nullable(),
});

export async function systemInternalRoutes(app: FastifyInstance): Promise<void> {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post('/internal/worker/heartbeat', { schema: { body: heartbeatBodySchema } }, async (request) => {
    recordHeartbeat(request.body);
    return { ok: true };
  });

  typedApp.get('/internal/settings', async () => getAppSettings());
}
