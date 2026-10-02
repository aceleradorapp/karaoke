import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { rankingQuerySchema } from '@caraoke/shared';
import { getRanking } from './service.js';

export async function rankingRoutes(app: FastifyInstance): Promise<void> {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get('/ranking', { schema: { querystring: rankingQuerySchema } }, async (request) =>
    getRanking(request.query.period, request.query.scope),
  );
}
