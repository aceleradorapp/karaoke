import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HealthReport } from '@caraoke/shared';
import { apiGet, apiSend } from './client';

export const HEALTH_QUERY_KEY = ['health-report'] as const;
const REFRESH_MS = 120_000;

export function useHealthReportQuery() {
  return useQuery({
    queryKey: HEALTH_QUERY_KEY,
    queryFn: () => apiGet<HealthReport>('/system/health-report'),
    refetchInterval: REFRESH_MS,
  });
}

export function useCheckHealthNowMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiGet<HealthReport>('/system/health-report?fresh=1'),
    onSuccess: (report) => queryClient.setQueryData(HEALTH_QUERY_KEY, report),
  });
}

export function useRestartSystemMutation() {
  return useMutation({
    mutationFn: () => apiSend<{ restarting: boolean }>('POST', '/system/restart'),
  });
}
