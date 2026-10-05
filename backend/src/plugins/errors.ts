import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { AppError, type ErrorResponseBody } from '../utils/errors.js';

export type PageFallback = (request: FastifyRequest, reply: FastifyReply) => FastifyReply | null;

export function registerErrorHandler(app: FastifyInstance, pageFallback: PageFallback | null = null): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      const body: ErrorResponseBody = {
        error: { code: error.code, message: error.message, details: error.details },
      };
      return reply.status(error.statusCode).send(body);
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const body: ErrorResponseBody = {
        error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos', details: error.validation },
      };
      return reply.status(400).send(body);
    }

    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      const code = (error as { code?: string }).code ?? 'BAD_REQUEST';
      const body: ErrorResponseBody = { error: { code, message: 'Requisição inválida' } };
      return reply.status(statusCode).send(body);
    }

    request.log.error(error);
    const body: ErrorResponseBody = {
      error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' },
    };
    return reply.status(500).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    const page = pageFallback?.(request, reply);
    if (page) return page;
    const body: ErrorResponseBody = {
      error: { code: 'ROUTE_NOT_FOUND', message: 'Rota não encontrada' },
    };
    return reply.status(404).send(body);
  });
}
