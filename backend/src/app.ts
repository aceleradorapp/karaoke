import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { jobsInternalRoutes } from './modules/jobs/internalRoutes.js';
import { systemInternalRoutes } from './modules/system/internalRoutes.js';
import { systemRoutes } from './modules/system/routes.js';
import { registerAccessControl } from './plugins/access.js';
import { registerErrorHandler } from './plugins/errors.js';

const BODY_LIMIT_BYTES = 1_000_000;

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
    trustProxy: '127.0.0.1',
    bodyLimit: BODY_LIMIT_BYTES,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, { origin: true });
  registerErrorHandler(app);
  registerAccessControl(app);

  await app.register(systemRoutes, { prefix: '/api' });
  await app.register(systemInternalRoutes, { prefix: '/api' });
  await app.register(jobsInternalRoutes, { prefix: '/api' });

  return app;
}
