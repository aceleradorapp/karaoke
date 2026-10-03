import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { getAccessCode } from '../modules/settings/service.js';
import { safeEqual } from '../utils/safeEqual.js';
import { unauthorized } from '../utils/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    isMobile: boolean;
  }
}

type AllowedRoute = [method: string, pattern: RegExp];

const MOBILE_ALLOWED_ROUTES: AllowedRoute[] = [
  ['GET', /^\/api\/health$/],
  ['GET', /^\/api\/system\/access\/check$/],
  ['GET', /^\/api\/youtube\/search$/],
  ['POST', /^\/api\/youtube\/import$/],
  ['POST', /^\/api\/uploads$/],
  ['GET', /^\/api\/jobs$/],
  ['GET', /^\/api\/songs$/],
  ['GET', /^\/api\/profiles$/],
  ['POST', /^\/api\/profiles$/],
  ['GET', /^\/api\/sing-queue$/],
  ['POST', /^\/api\/sing-queue$/],
  ['DELETE', /^\/api\/sing-queue\/[^/]+$/],
  ['GET', /^\/api\/performances\/voting\/current$/],
  ['GET', /^\/api\/player\/state$/],
  ['GET', /^\/api\/system\/time$/],
  ['POST', /^\/api\/performances\/[^/]+\/votes$/],
];

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

const INTERNAL_PREFIX = '/api/internal/';
const API_PREFIX = '/api/';
const MEDIA_PREFIX = '/media/';

const PHONE_MEDIA_PATTERN = /^\/media\/[^/]+\/(capa\.jpg|letra\.json)$/;
const ACCESS_CODE_QUERY = 'c';

function queryValue(url: string, name: string): string | null {
  const query = url.split('?')[1];
  return query ? new URLSearchParams(query).get(name) : null;
}

const ACCESS_DENIED_MESSAGE = 'Código de acesso inválido. Escaneie o QR code novamente.';

function isMobileRouteAllowed(method: string, path: string): boolean {
  return MOBILE_ALLOWED_ROUTES.some(
    ([allowedMethod, pattern]) => allowedMethod === method && pattern.test(path),
  );
}

export function registerAccessControl(app: FastifyInstance): void {
  app.decorateRequest('isMobile', false);

  app.addHook('onRequest', async (request) => {
    const path = request.url.split('?')[0] ?? '';

    if (path.startsWith(INTERNAL_PREFIX)) {
      if (!safeEqual(request.headers['x-worker-token'], env.WORKER_TOKEN)) {
        throw unauthorized('ACCESS_DENIED', 'Token inválido');
      }
      return;
    }

    const isGuardedPath = path.startsWith(API_PREFIX) || path.startsWith(MEDIA_PREFIX);
    if (!isGuardedPath) return;
    if (LOOPBACK_ADDRESSES.has(request.ip)) return;

    const accessCode = await getAccessCode();
    const isPhoneMedia = request.method === 'GET' && PHONE_MEDIA_PATTERN.test(path);
    const presented = isPhoneMedia
      ? (request.headers['x-access-code'] ?? queryValue(request.url, ACCESS_CODE_QUERY))
      : request.headers['x-access-code'];
    const hasValidCode = accessCode !== null && safeEqual(presented, accessCode);
    const isAllowed =
      isPhoneMedia || (!path.startsWith(MEDIA_PREFIX) && isMobileRouteAllowed(request.method, path));
    if (!hasValidCode || !isAllowed) {
      throw unauthorized('ACCESS_DENIED', ACCESS_DENIED_MESSAGE);
    }
    request.isMobile = true;
  });
}
