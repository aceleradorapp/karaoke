import { DEFAULT_AVATAR_ID, DEFAULT_THEME_ID } from '@caraoke/shared';
import { prisma } from '../src/db.js';
import { ACCESS_CODE_SETTING_KEY, DEFAULT_APP_SETTINGS } from '../src/modules/settings/defaults.js';
import { generateAccessCode } from '../src/utils/accessCode.js';

const INITIAL_PROFILE_NAME = 'Michael';

async function seedSettings(): Promise<void> {
  const defaults: Record<string, unknown> = {
    ...DEFAULT_APP_SETTINGS,
    [ACCESS_CODE_SETTING_KEY]: generateAccessCode(),
  };

  for (const [key, value] of Object.entries(defaults)) {
    await prisma.setting.upsert({
      where: { key },
      update: {},
      create: { key, value: value as never },
    });
  }
}

async function seedInitialProfile(): Promise<void> {
  const profileCount = await prisma.profile.count();
  if (profileCount > 0) return;

  await prisma.profile.create({
    data: { name: INITIAL_PROFILE_NAME, avatar: DEFAULT_AVATAR_ID, theme: DEFAULT_THEME_ID },
  });
}

async function main(): Promise<void> {
  await seedSettings();
  await seedInitialProfile();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
