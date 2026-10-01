import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreatePerformanceInput, FinishPerformanceInput } from '@caraoke/shared';
import { apiSend } from './client';

interface FinishVariables extends FinishPerformanceInput {
  id: string;
}

export function useStartPerformanceMutation() {
  return useMutation({
    mutationFn: (input: CreatePerformanceInput) => apiSend<{ id: string }>('POST', '/performances', input),
  });
}

export function useFinishPerformanceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: FinishVariables) =>
      apiSend<{ finalScore: number | null }>('POST', `/performances/${id}/finish`, body),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['home'] }),
  });
}
