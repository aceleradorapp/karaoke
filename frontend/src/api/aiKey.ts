import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiKeyCreatedDTO, AiKeyStatusDTO } from '@caraoke/shared';
import { apiGet, apiSend } from './client';

const AI_KEY_QUERY_KEY = ['ai-key'] as const;

export function useAiKeyQuery() {
  return useQuery({ queryKey: AI_KEY_QUERY_KEY, queryFn: () => apiGet<AiKeyStatusDTO>('/ai-key') });
}

export function useGenerateAiKeyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend<AiKeyCreatedDTO>('POST', '/ai-key'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: AI_KEY_QUERY_KEY }),
  });
}

export function useRevokeAiKeyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend<void>('DELETE', '/ai-key'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: AI_KEY_QUERY_KEY }),
  });
}
