import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePerformanceInput,
  FinalScore,
  FinishPerformanceInput,
  FinishPerformanceResult,
} from '@caraoke/shared';
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
      apiSend<FinishPerformanceResult>('POST', `/performances/${id}/finish`, body),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['home'] }),
  });
}

export function useCloseVotingMutation() {
  return useMutation({
    mutationFn: (performanceId: string) =>
      apiSend<FinalScore>('POST', `/performances/${performanceId}/voting/close`),
  });
}
