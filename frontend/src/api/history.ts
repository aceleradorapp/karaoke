import { useInfiniteQuery } from '@tanstack/react-query';
import type { HistoryResponse } from '@caraoke/shared';
import { apiGet } from './client';

const PAGE_SIZE = 30;

export function useHistoryInfiniteQuery(profileId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['history', profileId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiGet<HistoryResponse>(
        `/profiles/${profileId}/history?limit=${PAGE_SIZE}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(profileId),
  });
}
