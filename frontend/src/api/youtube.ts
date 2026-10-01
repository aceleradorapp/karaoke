import { useMutation, useQuery } from '@tanstack/react-query';
import type { ImportResultDTO, ImportYoutubeInput, YoutubeSearchResult } from '@caraoke/shared';
import { apiGet, apiSend } from './client';

const SEARCH_STALE_TIME_MS = 10 * 60 * 1000;

interface SearchResponse {
  items: YoutubeSearchResult[];
}

export function useYoutubeSearchQuery(query: string) {
  return useQuery({
    queryKey: ['youtube-search', query],
    queryFn: async () =>
      (await apiGet<SearchResponse>(`/youtube/search?q=${encodeURIComponent(query)}`)).items,
    enabled: query.length > 0,
    staleTime: SEARCH_STALE_TIME_MS,
    retry: false,
  });
}

export function useImportYoutubeMutation() {
  return useMutation({
    mutationFn: (input: ImportYoutubeInput) => apiSend<ImportResultDTO>('POST', '/youtube/import', input),
  });
}
