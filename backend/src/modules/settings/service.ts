import type { AppSettings, UpdateSettingsInput } from '@caraoke/shared';
import { prisma } from '../../db.js';
import { emitToRoom } from '../../realtime.js';
import { publishSingQueue } from '../singQueue/service.js';
import { ACCESS_CODE_SETTING_KEY, DEFAULT_APP_SETTINGS } from './defaults.js';

const QUEUE_SETTINGS_PREFIX = 'queue.';

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

export async function updateAppSettings(changes: UpdateSettingsInput): Promise<AppSettings> {
  await prisma.$transaction(
    Object.entries(changes).map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: value as never },
        create: { key, value: value as never },
      }),
    ),
  );
  const settings = await getAppSettings();
  emitToRoom('stage', 'settings:updated', settings);
  if (Object.keys(changes).some((key) => key.startsWith(QUEUE_SETTINGS_PREFIX))) await publishSingQueue();
  return settings;
}
