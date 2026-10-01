import type { FastifyInstance } from 'fastify';
import { SUPPORTED_AUDIO_EXTENSIONS } from '@caraoke/shared';
import { AppError } from '../../utils/errors.js';
import { receiveUploads } from './service.js';

const CREATED = 201;

export async function uploadRoutes(app: FastifyInstance): Promise<void> {
  app.post('/uploads', async (request, reply) => {
    if (!request.isMultipart()) {
      throw new AppError('NOT_MULTIPART', 'Envie os arquivos como formulário (multipart)', 400);
    }

    const result = await receiveUploads(request.parts());

    if (result.received.length === 0) {
      throw new AppError(
        'UNSUPPORTED_FILE',
        `Nenhum arquivo aceito. Formatos suportados: ${SUPPORTED_AUDIO_EXTENSIONS.join(', ')}`,
        400,
        { rejected: result.rejected },
      );
    }
    return reply.status(CREATED).send(result);
  });
}
