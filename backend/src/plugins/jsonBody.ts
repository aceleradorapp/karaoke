import type { FastifyInstance } from 'fastify';

const JSON_CONTENT_TYPE = 'application/json';

export function registerLenientJsonParser(app: FastifyInstance): void {
  const defaultParser = app.getDefaultJsonParser('error', 'ignore');

  app.removeContentTypeParser(JSON_CONTENT_TYPE);
  app.addContentTypeParser(JSON_CONTENT_TYPE, { parseAs: 'string' }, (request, body, done) => {
    const isEmpty = String(body).trim() === '';
    if (isEmpty) return done(null, undefined);
    defaultParser(request, String(body), done);
  });
}
