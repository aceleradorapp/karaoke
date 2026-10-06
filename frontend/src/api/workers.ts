import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PairingCodeDTO, ProcessingWorkerDTO } from '@caraoke/shared';
import { apiGet, apiSend } from './client';

export const WORKERS_QUERY_KEY = ['workers'] as const;
const WORKERS_REFRESH_MS = 10_000;

export function useWorkersQuery() {
  return useQuery({
    queryKey: WORKERS_QUERY_KEY,
    queryFn: async () => (await apiGet<{ items: ProcessingWorkerDTO[] }>('/workers')).items,
    refetchInterval: WORKERS_REFRESH_MS,
  });
}

export function useStartPairingMutation() {
  return useMutation({ mutationFn: () => apiSend<PairingCodeDTO>('POST', '/workers/pairing') });
}

export function useCancelPairingMutation() {
  return useMutation({ mutationFn: () => apiSend<void>('DELETE', '/workers/pairing') });
}

export function useRenameWorkerMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiSend<void>('PATCH', `/workers/${id}`, { name }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: WORKERS_QUERY_KEY }),
  });
}

export function useRemoveWorkerMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend<void>('DELETE', `/workers/${id}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: WORKERS_QUERY_KEY }),
  });
}
