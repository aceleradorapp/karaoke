import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppSettings, UpdateSettingsInput } from '@caraoke/shared';
import { apiGet, apiSend } from './client';

export const SETTINGS_QUERY_KEY = ['settings'] as const;

export function useSettingsQuery(isEnabled = true) {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => apiGet<AppSettings>('/settings'),
    enabled: isEnabled,
  });
}

export function useUpdateSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: UpdateSettingsInput) => apiSend<AppSettings>('PATCH', '/settings', changes),
    onSuccess: (settings) => queryClient.setQueryData(SETTINGS_QUERY_KEY, settings),
  });
}
