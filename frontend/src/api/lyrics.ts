import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { LyricsDoc } from '@caraoke/shared';

const LYRICS_STALE_TIME_MS = 5 * 60 * 1000;

async function fetchLyrics(url: string): Promise<LyricsDoc> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Não foi possível carregar a letra');
  return (await response.json()) as LyricsDoc;
}

export function useLyricsQuery(url: string | null) {
  return useQuery({
    queryKey: ['lyrics', url],
    queryFn: () => fetchLyrics(url as string),
    enabled: url !== null,
    staleTime: LYRICS_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    retry: false,
  });
}
