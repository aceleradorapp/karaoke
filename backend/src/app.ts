import compress from '@fastify/compress';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_FILES } from '@caraoke/shared';
import { competitionRoutes } from './modules/competitions/routes.js';
import { favoriteRoutes } from './modules/favorites/routes.js';
import { jobsInternalRoutes } from './modules/jobs/internalRoutes.js';
import { jobRoutes } from './modules/jobs/routes.js';
import { performanceRoutes } from './modules/performances/routes.js';
import { playerRoutes } from './modules/player/routes.js';
import { playlistRoutes } from './modules/playlists/routes.js';
import { profileRoutes } from './modules/profiles/routes.js';
import { rankingRoutes } from './modules/ranking/routes.js';
import { settingsRoutes } from './modules/settings/routes.js';
import { singQueueRoutes } from './modules/singQueue/routes.js';
import { songRoutes } from './modules/songs/routes.js';
import { systemInternalRoutes } from './modules/system/internalRoutes.js';
import { uploadRoutes } from './modules/uploads/routes.js';
import { youtubeRoutes } from './modules/youtube/routes.js';
import { lyricsCheckRoutes } from './modules/lyricsCheck/routes.js';
import { systemRoutes } from './modules/system/routes.js';
import { registerAccessControl } from './plugins/access.js';
import { env } from './env.js';
import { registerErrorHandler } from './plugins/errors.js';
import { hasBuiltWeb, registerWeb, webPageFallback } from './plugins/web.js';
import { registerLenientJsonParser } from './plugins/jsonBody.js';
import { storagePaths } from './services/storage.js';

const BODY_LIMIT_BYTES = 1_000_000;

export interface BuildAppOptions {
  logger?: boolean;
  maxUploadBytes?: number;
  webDistDir?: string | null;
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

  const webDistDir =
    options.webDistDir !== undefined
      ? options.webDistDir
      : env.NODE_ENV === 'production' && hasBuiltWeb(env.WEB_DIST_DIR)
        ? env.WEB_DIST_DIR
        : null;

  if (webDistDir) await app.register(compress, { encodings: ['br', 'gzip'] });
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
  registerErrorHandler(app, webDistDir ? webPageFallback(webDistDir) : null);
  registerAccessControl(app);

  await app.register(systemRoutes, { prefix: '/api' });
  await app.register(jobRoutes, { prefix: '/api' });
  await app.register(performanceRoutes, { prefix: '/api' });
  await app.register(playerRoutes, { prefix: '/api' });
  await app.register(playlistRoutes, { prefix: '/api' });
  await app.register(favoriteRoutes, { prefix: '/api' });
  await app.register(competitionRoutes, { prefix: '/api' });
  await app.register(profileRoutes, { prefix: '/api' });
  await app.register(rankingRoutes, { prefix: '/api' });
  await app.register(settingsRoutes, { prefix: '/api' });
  await app.register(singQueueRoutes, { prefix: '/api' });
  await app.register(songRoutes, { prefix: '/api' });
  await app.register(uploadRoutes, { prefix: '/api' });
  await app.register(youtubeRoutes, { prefix: '/api' });
  await app.register(lyricsCheckRoutes, { prefix: '/api' });
  await app.register(systemInternalRoutes, { prefix: '/api' });
  await app.register(jobsInternalRoutes, { prefix: '/api' });
  if (webDistDir) await registerWeb(app, webDistDir);

  return app;
}
