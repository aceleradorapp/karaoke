import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkerStatus } from '@caraoke/shared';
import { apiGet, apiSend } from './client';

export interface WorkerInfo extends WorkerStatus {
  lastSeen: string | null;
  cudaAvailable: boolean;
  vramMb: number | null;
  ytdlpVersion: string | null;
}

export interface SystemInfo {
  worker: WorkerInfo;
  storage: { usedBytes: number; songs: number };
}

const SYSTEM_INFO_REFRESH_MS = 5_000;

export function useSystemInfoQuery() {
  return useQuery({
    queryKey: ['system'],
    queryFn: () => apiGet<SystemInfo>('/system/info'),
    refetchInterval: SYSTEM_INFO_REFRESH_MS,
  });
}

export function useUpdateYtdlpMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend<{ version: string }>('POST', '/system/ytdlp/update'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['system'] }),
  });
}
