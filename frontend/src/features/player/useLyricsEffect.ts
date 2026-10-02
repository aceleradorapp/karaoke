import {
  FILL_PERCENT_MAX,
  FILL_PERCENT_MIN,
  FILL_PERCENT_STEP,
  type AppSettings,
  type LyricsEffectId,
  type SongDTO,
  type UpdateSettingsInput,
} from '@caraoke/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { SETTINGS_QUERY_KEY, useSettingsQuery, useUpdateSettingsMutation } from '../../api/settings';
import { useUpdateSongMutation } from '../../api/songs';
import { DEFAULT_EFFECT_SETTINGS } from '../../lib/lyrics/effects';
import { useAutoSave, type AutoSave } from '../../lib/useAutoSave';
import { toast } from '../../stores/useToastStore';

const SAVE_DELAY_MS = 600;

export interface LyricsEffectChoice {
  enabled: boolean;
  id: LyricsEffectId;
  setEnabled: (enabled: boolean) => void;
  setId: (id: LyricsEffectId) => void;
}

export function useLyricsEffectChoice(): LyricsEffectChoice {
  const queryClient = useQueryClient();
  const settings = useSettingsQuery();
  const { mutate } = useUpdateSettingsMutation();

  const change = useCallback(
    (changes: UpdateSettingsInput) => {
      queryClient.setQueryData<AppSettings>(SETTINGS_QUERY_KEY, (current) =>
        current ? { ...current, ...changes } : current,
      );
      mutate(changes, {
        onError: () => {
          void queryClient.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
          toast.error('Não foi possível guardar a escolha do efeito da letra');
        },
      });
    },
    [queryClient, mutate],
  );

  return {
    enabled: settings.data?.['player.lyricsEffectEnabled'] ?? DEFAULT_EFFECT_SETTINGS.enabled,
    id: settings.data?.['player.lyricsEffect'] ?? DEFAULT_EFFECT_SETTINGS.id,
    setEnabled: useCallback(
      (enabled: boolean) => change({ 'player.lyricsEffectEnabled': enabled }),
      [change],
    ),
    setId: useCallback((id: LyricsEffectId) => change({ 'player.lyricsEffect': id }), [change]),
  };
}

export function clampFillPercent(value: number): number {
  const stepped = Math.round(value / FILL_PERCENT_STEP) * FILL_PERCENT_STEP;
  return Math.min(FILL_PERCENT_MAX, Math.max(FILL_PERCENT_MIN, stepped));
}

export interface SongFillPercent {
  value: number;
  set: (value: number) => void;
  autoSave: AutoSave;
}

export function useSongFillPercent(song: SongDTO): SongFillPercent {
  const updateSong = useUpdateSongMutation(song.id);
  const [value, setValue] = useState(song.fillPercent);

  const autoSave = useAutoSave(value, (percent) => updateSong.mutateAsync({ fillPercent: percent }), {
    delayMs: SAVE_DELAY_MS,
  });

  return { value, set: useCallback((next: number) => setValue(clampFillPercent(next)), []), autoSave };
}
