import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { RankingPeriod, RankingResponse, RankingScope } from '@caraoke/shared';
import { apiGet } from './client';

export function useRankingQuery(period: RankingPeriod, scope: RankingScope) {
  return useQuery({
    queryKey: ['ranking', period, scope],
    queryFn: () => apiGet<RankingResponse>(`/ranking?period=${period}&scope=${scope}`),
    placeholderData: keepPreviousData,
  });
}
