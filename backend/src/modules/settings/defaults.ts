import { DEFAULT_LYRICS_EFFECT_ID, DEFAULT_THEME_ID, type AppSettings } from '@caraoke/shared';

export const ACCESS_CODE_SETTING_KEY = 'access.code';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  'processing.device': 'auto',
  'processing.demucsModel': 'htdemucs',
  'processing.whisperModel': 'small',
  'processing.autoAlign': true,
  'scoring.mode': 'pitch+audience',
  'scoring.audienceWeight': 0.2,
  'scoring.voteSeconds': 20,
  'scoring.micLatencyMs': 150,
  'scoring.micDeviceId': null,
  'ui.defaultTheme': DEFAULT_THEME_ID,
  'player.lyricsEffectEnabled': true,
  'player.lyricsEffect': DEFAULT_LYRICS_EFFECT_ID,
};
