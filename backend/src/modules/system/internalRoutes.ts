import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { recoverInterruptedJobs } from '../jobs/recovery.js';
import { getAppSettings } from '../settings/service.js';
import { LOCAL_WORKER_ID, recordHeartbeat } from '../../services/workerStatus.js';

const heartbeatBodySchema = z.object({
  instanceId: z.string().min(1),
  device: z.string(),
  cudaAvailable: z.boolean(),
  gpuName: z.string().nullable(),
  vramMb: z.number().nullable(),
  ytdlpVersion: z.string().nullable(),
});

export async function systemInternalRoutes(app: FastifyInstance): Promise<void> {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post('/internal/worker/heartbeat', { schema: { body: heartbeatBodySchema } }, async (request) => {
    const workerId = request.workerId ?? LOCAL_WORKER_ID;
    const hasRestarted = recordHeartbeat(request.body, Date.now(), workerId);
    if (hasRestarted) await recoverInterruptedJobs(workerId);
    return { ok: true };
  });

  typedApp.get('/internal/settings', async () => getAppSettings());
}
