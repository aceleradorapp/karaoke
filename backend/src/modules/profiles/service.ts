import type { Profile } from '@prisma/client';
import {
  DEFAULT_THEME_ID,
  type CreateProfileInput,
  type ProfileDTO,
  type UpdateProfileInput,
} from '@caraoke/shared';
import { prisma } from '../../db.js';
import { notFound } from '../../utils/errors.js';
import { publishSingQueue } from '../singQueue/service.js';

export function toProfileDTO(profile: Profile): ProfileDTO {
  return {
    id: profile.id,
    name: profile.name,
    avatar: profile.avatar,
    theme: profile.theme,
    isGuest: profile.isGuest,
    createdAt: profile.createdAt.toISOString(),
    lastUsedAt: profile.lastUsedAt.toISOString(),
  };
}

function profileNotFound() {
  return notFound('PROFILE_NOT_FOUND', 'Perfil não encontrado');
}

async function findProfileOrThrow(id: string): Promise<Profile> {
  const profile = await prisma.profile.findUnique({ where: { id } });
  if (!profile) throw profileNotFound();
  return profile;
}

export async function listProfiles(): Promise<ProfileDTO[]> {
  const [family, guests] = await Promise.all([
    prisma.profile.findMany({ where: { isGuest: false }, orderBy: { createdAt: 'asc' } }),
    prisma.profile.findMany({ where: { isGuest: true }, orderBy: { lastUsedAt: 'desc' } }),
  ]);
  return [...family, ...guests].map(toProfileDTO);
}

export async function createProfile(input: CreateProfileInput): Promise<ProfileDTO> {
  const profile = await prisma.profile.create({
    data: {
      name: input.name,
      avatar: input.avatar,
      theme: input.theme ?? DEFAULT_THEME_ID,
      isGuest: input.isGuest ?? false,
    },
  });
  return toProfileDTO(profile);
}

export async function updateProfile(id: string, changes: UpdateProfileInput): Promise<ProfileDTO> {
  await findProfileOrThrow(id);
  const profile = await prisma.profile.update({ where: { id }, data: changes });
  return toProfileDTO(profile);
}

export async function touchProfile(id: string): Promise<ProfileDTO> {
  await findProfileOrThrow(id);
  const profile = await prisma.profile.update({ where: { id }, data: { lastUsedAt: new Date() } });
  return toProfileDTO(profile);
}

export async function deleteProfile(id: string): Promise<void> {
  await findProfileOrThrow(id);
  await prisma.profile.delete({ where: { id } });
  await publishSingQueue();
}
