import { useQuery } from '@tanstack/react-query';
import { apiGet } from './client';

export interface HealthResponse {
  ok: true;
  version: string;
}

export function useHealthQuery() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiGet<HealthResponse>('/health'),
    retry: false,
    refetchInterval: 10_000,
  });
}
