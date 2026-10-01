import { useQuery } from '@tanstack/react-query';
import type { WorkerStatus } from '@caraoke/shared';
import { apiGet } from './client';

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
