import type { AppSettings } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { ACCESS_CODE_SETTING_KEY, DEFAULT_APP_SETTINGS } from './defaults.js';

export async function getAppSettings(): Promise<AppSettings> {
  const rows = await prisma.setting.findMany();
  const stored = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const knownKeys = Object.keys(DEFAULT_APP_SETTINGS);
  const overrides = Object.fromEntries(Object.entries(stored).filter(([key]) => knownKeys.includes(key)));
  return { ...DEFAULT_APP_SETTINGS, ...overrides };
}

export async function getAccessCode(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: ACCESS_CODE_SETTING_KEY } });
  return typeof row?.value === 'string' ? row.value : null;
}
