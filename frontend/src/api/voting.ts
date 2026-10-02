import { useMutation, useQuery } from '@tanstack/react-query';
import type { CastVoteInput, FinalScore, VotingSummary } from '@caraoke/shared';
import { apiGet, apiSend } from './client';

export const CURRENT_VOTING_QUERY_KEY = ['voting', 'current'] as const;
export const FINAL_SCORE_QUERY_KEY = ['voting', 'final'] as const;

export function useCurrentVotingQuery() {
  return useQuery({
    queryKey: CURRENT_VOTING_QUERY_KEY,
    queryFn: () => apiGet<VotingSummary | null>('/performances/voting/current'),
  });
}

export function useFinalScoreQuery() {
  return useQuery<FinalScore | null>({
    queryKey: FINAL_SCORE_QUERY_KEY,
    queryFn: () => null,
    staleTime: Infinity,
  });
}

interface CastVoteVariables extends CastVoteInput {
  performanceId: string;
}

export function useCastVoteMutation() {
  return useMutation({
    mutationFn: ({ performanceId, ...body }: CastVoteVariables) =>
      apiSend<{ votes: number }>('POST', `/performances/${performanceId}/votes`, body),
  });
}
