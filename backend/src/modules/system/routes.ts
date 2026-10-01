import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { REPO_ROOT } from '../../env.js';
import { diskUsage } from '../../services/storage.js';
import { getWorkerInfo } from '../../services/workerStatus.js';

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
}
