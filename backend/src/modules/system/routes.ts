import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { REPO_ROOT } from '../../env.js';
import { diskUsage } from '../../services/storage.js';
import { updateYtdlp } from '../../services/ytdlp.js';
import { getWorkerInfo } from '../../services/workerStatus.js';
import { getAccessInfo, regenerateAccessCode } from './access.js';
import { emitToAll } from '../../realtime.js';
import { isSupervised, requestRestart } from '../../services/lifecycle.js';
import { conflict } from '../../utils/errors.js';
import { getHealthReport } from './health.js';

const ACCEPTED = 202;
const RESTART_DELAY_MS = 300;

function readAppVersion(): string {
  const packagePath = path.join(REPO_ROOT, 'backend', 'package.json');
  const content = JSON.parse(fs.readFileSync(packagePath, 'utf-8')) as { version: string };
  return content.version;
}

const appVersion = readAppVersion();

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/health',
    {
      schema: {
        response: { 200: z.object({ ok: z.literal(true), version: z.string() }) },
      },
    },
    async () => ({ ok: true as const, version: appVersion }),
  );

  app.get('/system/info', async () => {
    const [usage, songs] = await Promise.all([diskUsage(), prisma.song.count()]);
    return {
      worker: getWorkerInfo(),
      storage: { usedBytes: usage.usedBytes, songs },
    };
  });

  app
    .withTypeProvider<ZodTypeProvider>()
    .get(
      '/system/health-report',
      { schema: { querystring: z.object({ fresh: z.string().optional() }) } },
      async (request) => getHealthReport(request.query.fresh === '1'),
    );

  app.post('/system/restart', async (_request, reply) => {
    if (!isSupervised()) {
      throw conflict(
        'RESTART_UNAVAILABLE',
        'Reiniciar pelo app só funciona no modo festa (npm run festa). No modo de desenvolvimento, reinicie pela janela do sistema.',
      );
    }
    emitToAll('system:restarting');
    setTimeout(() => void requestRestart(), RESTART_DELAY_MS);
    return reply.status(ACCEPTED).send({ restarting: true });
  });

  app.get('/system/access', async () => getAccessInfo());

  app.post('/system/access/regenerate', async () => regenerateAccessCode());

  app.get('/system/access/check', async () => ({ ok: true as const }));

  app.post('/system/ytdlp/update', async () => ({ version: await updateYtdlp() }));
}
