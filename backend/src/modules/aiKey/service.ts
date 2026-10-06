import { createHash, randomBytes } from 'node:crypto';
import type { AiKeyCreatedDTO, AiKeyStatusDTO } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { env } from '../../env.js';
import { listPrivateIPv4 } from '../../services/network.js';
import { safeEqual } from '../../utils/safeEqual.js';

export const AI_KEY_SETTING_KEY = 'ai.keyHash';
const KEY_PREFIX = 'ck_';
const KEY_BYTES = 24;
export const MCP_DOWNLOAD_PATH = '/downloads/caraoke-mcp.mjs';

interface StoredAiKey {
  hash: string;
  createdAt: string;
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function isStoredAiKey(value: unknown): value is StoredAiKey {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.hash === 'string' && typeof candidate.createdAt === 'string';
}

async function readStoredKey(): Promise<StoredAiKey | null> {
  const row = await prisma.setting.findUnique({ where: { key: AI_KEY_SETTING_KEY } });
  return isStoredAiKey(row?.value) ? row.value : null;
}

export function serverUrls(addresses: string[] = listPrivateIPv4()): string[] {
  return addresses.map((address) => `http://${address}:${env.API_PORT}`);
}

export async function getAiKeyStatus(): Promise<AiKeyStatusDTO> {
  const stored = await readStoredKey();
  return {
    hasKey: stored !== null,
    createdAt: stored?.createdAt ?? null,
    serverUrls: serverUrls(),
    mcpDownloadPath: MCP_DOWNLOAD_PATH,
  };
}

export async function generateAiKey(now: Date = new Date()): Promise<AiKeyCreatedDTO> {
  const key = `${KEY_PREFIX}${randomBytes(KEY_BYTES).toString('base64url')}`;
  const stored: StoredAiKey = { hash: hashKey(key), createdAt: now.toISOString() };
  await prisma.setting.upsert({
    where: { key: AI_KEY_SETTING_KEY },
    update: { value: { ...stored } },
    create: { key: AI_KEY_SETTING_KEY, value: { ...stored } },
  });
  return { key, createdAt: stored.createdAt };
}

export async function revokeAiKey(): Promise<void> {
  await prisma.setting.deleteMany({ where: { key: AI_KEY_SETTING_KEY } });
}

export async function matchesAiKey(presented: string): Promise<boolean> {
  const stored = await readStoredKey();
  return stored !== null && safeEqual(hashKey(presented), stored.hash);
}
