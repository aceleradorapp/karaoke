import fs from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import type { PageFallback } from './errors.js';

const INDEX_FILE = 'index.html';
const HASHED_ASSETS_DIR = `${path.sep}assets${path.sep}`;
const LONG_CACHE = 'public, max-age=31536000, immutable';
const NO_CACHE = 'no-cache';
const SERVER_PREFIXES = ['/api/', '/media/', '/socket.io/'];

export function hasBuiltWeb(distDir: string): boolean {
  return fs.existsSync(path.join(distDir, INDEX_FILE));
}

export async function registerWeb(app: FastifyInstance, distDir: string): Promise<void> {
  await app.register(fastifyStatic, {
    root: distDir,
    prefix: '/',
    decorateReply: false,
    index: [INDEX_FILE],
    wildcard: true,
    setHeaders: (reply, filePath) => {
      reply.header('Cache-Control', filePath.includes(HASHED_ASSETS_DIR) ? LONG_CACHE : NO_CACHE);
    },
  });
}

export function webPageFallback(distDir: string): PageFallback {
  return (request, reply) => {
    const urlPath = request.url.split('?')[0] ?? '';
    const isPage = request.method === 'GET' && !SERVER_PREFIXES.some((prefix) => urlPath.startsWith(prefix));
    if (!isPage) return null;
    reply.header('Cache-Control', NO_CACHE);
    return reply.sendFile(INDEX_FILE, distDir, { cacheControl: false });
  };
}
