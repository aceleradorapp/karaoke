import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { matchesAiKey } from '../modules/aiKey/service.js';
import { getAccessCode } from '../modules/settings/service.js';
import { findWorkerIdByToken } from '../modules/workers/service.js';
import { LOCAL_WORKER_ID } from '../services/workerStatus.js';
import { safeEqual } from '../utils/safeEqual.js';
import { unauthorized } from '../utils/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    isMobile: boolean;
    isAi: boolean;
    workerId: string | null;
  }
}

type AllowedRoute = [method: string, pattern: RegExp];

const MOBILE_ALLOWED_ROUTES: AllowedRoute[] = [
  ['GET', /^\/api\/health$/],
  ['GET', /^\/api\/system\/access\/check$/],
  ['GET', /^\/api\/youtube\/search$/],
  ['POST', /^\/api\/youtube\/import$/],
  ['GET', /^\/api\/lyrics\/check$/],
  ['POST', /^\/api\/uploads$/],
  ['GET', /^\/api\/jobs$/],
  ['GET', /^\/api\/jobs\/estimate$/],
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

const AI_ALLOWED_ROUTES: AllowedRoute[] = [
  ['GET', /^\/api\/health$/],
  ['GET', /^\/api\/youtube\/search$/],
  ['POST', /^\/api\/youtube\/import$/],
  ['GET', /^\/api\/lyrics\/check$/],
  ['GET', /^\/api\/songs$/],
  ['GET', /^\/api\/songs\/[^/]+$/],
  ['GET', /^\/api\/jobs$/],
  ['GET', /^\/api\/jobs\/estimate$/],
  ['POST', /^\/api\/jobs\/[^/]+\/cancel$/],
  ['PATCH', /^\/api\/jobs\/reorder$/],
  ['PATCH', /^\/api\/jobs\/[^/]+\/target$/],
  ['GET', /^\/api\/workers$/],
];

const PUBLIC_ROUTES: AllowedRoute[] = [['POST', /^\/api\/workers\/pair$/]];

const BEARER_PREFIX = 'Bearer ';
const AI_KEY_DENIED_MESSAGE = 'Chave para IA inválida ou sem permissão para esta ação.';

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

function bearerToken(header: string | undefined): string | null {
  return header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length).trim() : null;
}

function isRouteAllowed(routes: AllowedRoute[], method: string, path: string): boolean {
  return routes.some(([allowedMethod, pattern]) => allowedMethod === method && pattern.test(path));
}

function isMobileRouteAllowed(method: string, path: string): boolean {
  return MOBILE_ALLOWED_ROUTES.some(
    ([allowedMethod, pattern]) => allowedMethod === method && pattern.test(path),
  );
}

export function registerAccessControl(app: FastifyInstance): void {
  app.decorateRequest('isMobile', false);
  app.decorateRequest('isAi', false);
  app.decorateRequest('workerId', null);

  app.addHook('onRequest', async (request) => {
    const path = request.url.split('?')[0] ?? '';

    if (path.startsWith(INTERNAL_PREFIX)) {
      const token = request.headers['x-worker-token'];
      if (safeEqual(token, env.WORKER_TOKEN)) {
        request.workerId = LOCAL_WORKER_ID;
        return;
      }
      const pairedId = typeof token === 'string' && token ? await findWorkerIdByToken(token) : null;
      if (!pairedId) throw unauthorized('ACCESS_DENIED', 'Token inválido');
      request.workerId = pairedId;
      return;
    }

    const isGuardedPath = path.startsWith(API_PREFIX) || path.startsWith(MEDIA_PREFIX);
    if (!isGuardedPath) return;
    if (LOOPBACK_ADDRESSES.has(request.ip)) return;
    if (isRouteAllowed(PUBLIC_ROUTES, request.method, path)) return;

    const aiKey = bearerToken(request.headers.authorization);
    if (aiKey !== null) {
      const isAllowed = isRouteAllowed(AI_ALLOWED_ROUTES, request.method, path);
      if (!isAllowed || !(await matchesAiKey(aiKey))) throw unauthorized('ACCESS_DENIED', AI_KEY_DENIED_MESSAGE);
      request.isAi = true;
      return;
    }

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
