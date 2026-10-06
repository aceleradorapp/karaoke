import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { REPO_ROOT } from '../../env.js';
import { notFound } from '../../utils/errors.js';

export type DownloadFiles = Record<string, string>;

export const DEFAULT_DOWNLOAD_FILES: DownloadFiles = {
  'caraoke-mcp.mjs': path.join(REPO_ROOT, 'mcp', 'dist', 'caraoke-mcp.mjs'),
  'Processador-do-Karaoke.zip': path.join(REPO_ROOT, 'dist-downloads', 'Processador-do-Karaoke.zip'),
};

const CONTENT_TYPES: Record<string, string> = {
  '.mjs': 'text/javascript; charset=utf-8',
  '.zip': 'application/zip',
};

export async function downloadRoutes(app: FastifyInstance, options: { files: DownloadFiles }): Promise<void> {
  app.get<{ Params: { file: string } }>('/downloads/:file', async (request, reply) => {
    const filePath = Object.hasOwn(options.files, request.params.file) ? options.files[request.params.file] : undefined;
    if (!filePath || !fs.existsSync(filePath)) {
      throw notFound('DOWNLOAD_NOT_FOUND', 'Arquivo ainda não gerado no PC do karaokê.');
    }
    return reply
      .header('Content-Type', CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${request.params.file}"`)
      .header('Cache-Control', 'no-cache')
      .send(fs.createReadStream(filePath));
  });
}
