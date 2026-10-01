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

export const appSettingsSchema = z.object({
  'processing.device': z.enum(['auto', 'gpu', 'cpu']),
  'processing.demucsModel': z.enum(['htdemucs', 'htdemucs_ft']),
  'processing.whisperModel': z.enum(['base', 'small', 'medium']),
  'processing.autoAlign': z.boolean(),
  'scoring.mode': z.enum(['pitch+audience', 'pitch', 'audience', 'off']),
  'scoring.audienceWeight': z.number().min(0).max(1),
  'scoring.voteSeconds': z.number().int().min(5).max(120),
  'scoring.micLatencyMs': z.number().int().min(0).max(1000),
  'scoring.micDeviceId': z.string().nullable(),
  'ui.defaultTheme': themeSchema,
});

export const updateSettingsSchema = appSettingsSchema
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, 'Nenhuma alteração informada');

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const SONG_TEXT_MAX_LENGTH = 200;

export const importYoutubeSchema = z.object({
  youtubeId: z.string().regex(YOUTUBE_ID_PATTERN, 'Vídeo inválido'),
  title: z.string().trim().min(1, 'Informe o título').max(SONG_TEXT_MAX_LENGTH),
  artist: z.string().trim().min(1, 'Informe o artista').max(SONG_TEXT_MAX_LENGTH),
  durationSec: z.number().int().positive().optional(),
  profileId: z.string().min(1).optional(),
});

export type ImportYoutubeInput = z.infer<typeof importYoutubeSchema>;

export const LYRICS_OFFSET_LIMIT_MS = 5000;

export const updateSongSchema = z
  .object({
    title: z.string().trim().min(1, 'Informe o título').max(SONG_TEXT_MAX_LENGTH).optional(),
    artist: z.string().trim().min(1, 'Informe o artista').max(SONG_TEXT_MAX_LENGTH).optional(),
    lyricsOffsetMs: z.number().int().min(-LYRICS_OFFSET_LIMIT_MS).max(LYRICS_OFFSET_LIMIT_MS).optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, 'Nenhuma alteração informada');

export type UpdateSongInput = z.infer<typeof updateSongSchema>;
