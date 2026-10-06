import { AUTO_ADVANCE_MAX_SECONDS, MAX_REQUESTS_PER_PERSON_LIMIT } from './constants.js';
import { z } from 'zod';
import { FILL_PERCENT_MAX, FILL_PERCENT_MIN, LYRICS_EFFECT_IDS } from './lyricsEffects.js';
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
  'player.lyricsEffectEnabled': z.boolean(),
  'player.lyricsEffect': z.enum(LYRICS_EFFECT_IDS),
  'queue.maxRequestsPerPerson': z.number().int().min(0).max(MAX_REQUESTS_PER_PERSON_LIMIT),
  'queue.stageBypassesLimit': z.boolean(),
  'queue.shuffle': z.boolean(),
  'queue.autoAdvanceSeconds': z.number().int().min(0).max(AUTO_ADVANCE_MAX_SECONDS),
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

export const LYRICS_OFFSET_LIMIT_MS = 60000;
export const KEY_SHIFT_LIMIT = 6;

export const updateSongSchema = z
  .object({
    title: z.string().trim().min(1, 'Informe o título').max(SONG_TEXT_MAX_LENGTH).optional(),
    artist: z.string().trim().min(1, 'Informe o artista').max(SONG_TEXT_MAX_LENGTH).optional(),
    lyricsOffsetMs: z.number().int().min(-LYRICS_OFFSET_LIMIT_MS).max(LYRICS_OFFSET_LIMIT_MS).optional(),
    fillPercent: z.number().int().min(FILL_PERCENT_MIN).max(FILL_PERCENT_MAX).optional(),
    keyShift: z.number().int().min(-KEY_SHIFT_LIMIT).max(KEY_SHIFT_LIMIT).optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, 'Nenhuma alteração informada');

export type UpdateSongInput = z.infer<typeof updateSongSchema>;

export const createPerformanceSchema = z.object({
  profileId: z.string().min(1),
  songId: z.string().min(1),
  requestId: z.string().min(1).optional(),
});

export const createSingRequestSchema = z.object({
  profileId: z.string().min(1),
  songId: z.string().min(1),
});

export const reorderSingQueueSchema = z.object({
  ids: z.array(z.string().min(1)).max(500),
});

export const finishPerformanceSchema = z.object({
  completed: z.boolean(),
  voiceGuideUsed: z.boolean(),
  pitchScore: z.number().int().min(0).max(100).nullable(),
});

export const VOTER_TOKEN_MIN_LENGTH = 8;
export const VOTER_TOKEN_MAX_LENGTH = 64;

export const castVoteSchema = z.object({
  voterToken: z.string().min(VOTER_TOKEN_MIN_LENGTH).max(VOTER_TOKEN_MAX_LENGTH),
  voterProfileId: z.string().min(1).optional(),
  stars: z.number().int().min(1).max(5),
});

export type CastVoteInput = z.infer<typeof castVoteSchema>;

export const playerStateInputSchema = z.union([
  z.object({ stopped: z.literal(true) }),
  z.object({
    songId: z.string().min(1),
    singer: z.object({ name: z.string().min(1).max(40), avatar: z.string().min(1).max(40) }).nullable(),
    position: z.number().min(0),
    playing: z.boolean(),
    offsetMs: z.number().int(),
    effect: z.object({
      enabled: z.boolean(),
      id: z.enum(LYRICS_EFFECT_IDS),
      fillPercent: z.number().int().min(FILL_PERCENT_MIN).max(FILL_PERCENT_MAX),
    }),
  }),
]);

export type PlayerStateInput = z.infer<typeof playerStateInputSchema>;

export const COMPETITION_NAME_MAX_LENGTH = 80;
export const COMPETITION_MAX_SONGS_PER_PARTICIPANT = 5;
export const COMPETITION_MAX_PARTICIPANTS = 30;

const competitionNameSchema = z
  .string()
  .trim()
  .min(1, 'Dê um nome para a disputa')
  .max(COMPETITION_NAME_MAX_LENGTH, `Use até ${COMPETITION_NAME_MAX_LENGTH} caracteres`);

export const createCompetitionSchema = z.object({ name: competitionNameSchema });

export const updateCompetitionSchema = z
  .object({
    name: competitionNameSchema.optional(),
    songsPerParticipant: z.number().int().min(1).max(COMPETITION_MAX_SONGS_PER_PARTICIPANT).optional(),
    scoringMode: z.enum(['pitch+audience', 'pitch', 'audience', 'off']).optional(),
    voteSeconds: z.number().int().min(5).max(120).optional(),
    autoAdvanceSeconds: z.number().int().min(0).max(AUTO_ADVANCE_MAX_SECONDS).optional(),
    shuffle: z.boolean().optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, 'Nenhuma alteração informada');

export const competitionParticipantsSchema = z.object({
  profileIds: z.array(z.string().min(1)).max(COMPETITION_MAX_PARTICIPANTS),
});

export const competitionSongSchema = z.object({ profileId: z.string().min(1), songId: z.string().min(1) });

export const competitionImageFromSongSchema = z.object({ songId: z.string().min(1) });

export type CreateCompetitionInput = z.infer<typeof createCompetitionSchema>;
export type UpdateCompetitionInput = z.infer<typeof updateCompetitionSchema>;

export const rankingQuerySchema = z.object({
  period: z.enum(['week', 'month', 'all']).default('month'),
  scope: z.enum(['all', 'family']).default('all'),
});
export type CreatePerformanceInput = z.infer<typeof createPerformanceSchema>;
export type FinishPerformanceInput = z.infer<typeof finishPerformanceSchema>;
export type CreateSingRequestInput = z.infer<typeof createSingRequestSchema>;

export const PLAYLIST_NAME_MAX_LENGTH = 80;

const playlistNameSchema = z
  .string()
  .trim()
  .min(1, 'Informe o nome da playlist')
  .max(PLAYLIST_NAME_MAX_LENGTH, `Use até ${PLAYLIST_NAME_MAX_LENGTH} letras`);

export const createPlaylistSchema = z.object({ name: playlistNameSchema });
export const updatePlaylistSchema = z.object({ name: playlistNameSchema });
export const addPlaylistItemSchema = z.object({ songId: z.string().min(1) });
export const reorderPlaylistSchema = z.object({ songIds: z.array(z.string().min(1)).max(1000) });

export type CreatePlaylistInput = z.infer<typeof createPlaylistSchema>;
export type UpdatePlaylistInput = z.infer<typeof updatePlaylistSchema>;
export type AddPlaylistItemInput = z.infer<typeof addPlaylistItemSchema>;
export type ReorderPlaylistInput = z.infer<typeof reorderPlaylistSchema>;

const LYRIC_TEXT_MAX_LENGTH = 500;
const LYRIC_LINES_MAX = 500;
const LYRIC_WORDS_MAX = 200;
const LANGUAGE_MAX_LENGTH = 10;

const lyricWordSchema = z
  .object({
    start: z.number().min(0),
    end: z.number().min(0),
    text: z.string().trim().min(1).max(SONG_TEXT_MAX_LENGTH),
  })
  .refine((word) => word.end >= word.start, 'O fim da palavra vem antes do começo');

const lyricLineSchema = z
  .object({
    start: z.number().min(0),
    end: z.number().min(0),
    text: z.string().trim().min(1, 'Linha sem texto').max(LYRIC_TEXT_MAX_LENGTH),
    words: z.array(lyricWordSchema).max(LYRIC_WORDS_MAX).optional(),
  })
  .refine((line) => line.end >= line.start, 'O fim da linha vem antes do começo');

export const saveLyricsSchema = z
  .object({
    synced: z.boolean(),
    language: z.string().trim().min(2).max(LANGUAGE_MAX_LENGTH).optional(),
    lines: z.array(lyricLineSchema).min(1, 'A letra precisa ter ao menos uma linha').max(LYRIC_LINES_MAX),
  })
  .refine(
    (doc) =>
      !doc.synced ||
      doc.lines.every((line, index) => index === 0 || line.start >= (doc.lines[index - 1]?.start ?? 0)),
    'As linhas precisam estar em ordem de tempo',
  );

export type SaveLyricsInput = z.infer<typeof saveLyricsSchema>;
