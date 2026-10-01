import { z } from 'zod';
import { isAvatarId } from './avatars.js';
import { isThemeId } from './themes.js';

export const PROFILE_NAME_MAX_LENGTH = 40;

const profileNameSchema = z
  .string()
  .trim()
  .min(1, 'Informe um nome')
  .max(PROFILE_NAME_MAX_LENGTH, `O nome pode ter no máximo ${PROFILE_NAME_MAX_LENGTH} caracteres`);

const avatarSchema = z.string().refine(isAvatarId, 'Avatar inválido');

const themeSchema = z.string().refine(isThemeId, 'Tema inválido');

export const createProfileSchema = z.object({
  name: profileNameSchema,
  avatar: avatarSchema,
  theme: themeSchema.optional(),
  isGuest: z.boolean().optional(),
});

export const updateProfileSchema = z
  .object({
    name: profileNameSchema.optional(),
    avatar: avatarSchema.optional(),
    theme: themeSchema.optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, 'Nenhuma alteração informada');

export type CreateProfileInput = z.infer<typeof createProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
