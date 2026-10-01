import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_FILES } from '@caraoke/shared';
import { jobsInternalRoutes } from './modules/jobs/internalRoutes.js';
import { jobRoutes } from './modules/jobs/routes.js';
import { profileRoutes } from './modules/profiles/routes.js';
import { settingsRoutes } from './modules/settings/routes.js';
import { songRoutes } from './modules/songs/routes.js';
import { systemInternalRoutes } from './modules/system/internalRoutes.js';
import { uploadRoutes } from './modules/uploads/routes.js';
import { youtubeRoutes } from './modules/youtube/routes.js';
import { systemRoutes } from './modules/system/routes.js';
import { registerAccessControl } from './plugins/access.js';
import { registerErrorHandler } from './plugins/errors.js';
import { registerLenientJsonParser } from './plugins/jsonBody.js';
import { storagePaths } from './services/storage.js';

const BODY_LIMIT_BYTES = 1_000_000;

export interface BuildAppOptions {
  logger?: boolean;
  maxUploadBytes?: number;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
    trustProxy: '127.0.0.1',
    bodyLimit: BODY_LIMIT_BYTES,
  });

  registerLenientJsonParser(app);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: { fileSize: options.maxUploadBytes ?? MAX_UPLOAD_BYTES, files: MAX_UPLOAD_FILES },
    throwFileSizeLimit: false,
  });
  await app.register(fastifyStatic, {
    root: storagePaths.libraryDir,
    prefix: '/media/',
    index: false,
    list: false,
    dotfiles: 'deny',
  });
  registerErrorHandler(app);
  registerAccessControl(app);

  await app.register(systemRoutes, { prefix: '/api' });
  await app.register(jobRoutes, { prefix: '/api' });
  await app.register(profileRoutes, { prefix: '/api' });
  await app.register(settingsRoutes, { prefix: '/api' });
  await app.register(songRoutes, { prefix: '/api' });
  await app.register(uploadRoutes, { prefix: '/api' });
  await app.register(youtubeRoutes, { prefix: '/api' });
  await app.register(systemInternalRoutes, { prefix: '/api' });
  await app.register(jobsInternalRoutes, { prefix: '/api' });

  return app;
}
