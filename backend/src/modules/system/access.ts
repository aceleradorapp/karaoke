import { SOCKET_ROOMS } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { env } from '../../env.js';
import { disconnectRoom, emitToRoom } from '../../realtime.js';
import { listPrivateIPv4 } from '../../services/network.js';
import { generateAccessCode } from '../../utils/accessCode.js';
import { ACCESS_CODE_SETTING_KEY } from '../settings/defaults.js';
import { getAccessCode } from '../settings/service.js';

export interface AccessInfo {
  code: string;
  urls: string[];
}

const MOBILE_PATH = '/m';
const NAMED_HOST_SUFFIX = '.nip.io';

function webPort(): number {
  return env.NODE_ENV === 'production' ? env.API_PORT : env.WEB_DEV_PORT;
}

async function saveAccessCode(code: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key: ACCESS_CODE_SETTING_KEY },
    update: { value: code },
    create: { key: ACCESS_CODE_SETTING_KEY, value: code },
  });
}

export async function ensureAccessCode(): Promise<string> {
  const existing = await getAccessCode();
  if (existing) return existing;
  const code = generateAccessCode();
  await saveAccessCode(code);
  return code;
}

export function buildAccessUrls(code: string, addresses: string[] = listPrivateIPv4()): string[] {
  const path = `:${webPort()}${MOBILE_PATH}?c=${encodeURIComponent(code)}`;
  const named = addresses.map((address) => `http://${address}${NAMED_HOST_SUFFIX}${path}`);
  const plain = addresses.map((address) => `http://${address}${path}`);
  return [...named, ...plain];
}

export async function getAccessInfo(): Promise<AccessInfo> {
  const code = await ensureAccessCode();
  return { code, urls: buildAccessUrls(code) };
}

export async function regenerateAccessCode(): Promise<AccessInfo> {
  const current = await getAccessCode();
  let code = generateAccessCode();
  while (code === current) code = generateAccessCode();

  await saveAccessCode(code);
  emitToRoom(SOCKET_ROOMS.mobile, 'access:changed');
  disconnectRoom(SOCKET_ROOMS.mobile);
  return { code, urls: buildAccessUrls(code) };
}
