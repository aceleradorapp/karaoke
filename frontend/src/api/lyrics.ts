import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LyricsDoc, SaveLyricsInput, SongDTO } from '@caraoke/shared';
import { ApiError, apiGet, apiSend } from './client';

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

export function useOriginalLyricsQuery(songId: string) {
  return useQuery({
    queryKey: ['lyrics-original', songId],
    queryFn: async () => {
      try {
        return await apiGet<LyricsDoc>(`/songs/${songId}/lyrics/original`);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    staleTime: LYRICS_STALE_TIME_MS,
    retry: false,
  });
}

export function useSaveLyricsMutation(songId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveLyricsInput) => apiSend<SongDTO>('PUT', `/songs/${songId}/lyrics`, input),
    onSuccess: (song) => {
      queryClient.setQueryData(['song', songId], song);
      void queryClient.invalidateQueries({ queryKey: ['lyrics-original', songId] });
      void queryClient.invalidateQueries({ queryKey: ['songs'] });
      void queryClient.invalidateQueries({ queryKey: ['home'] });
    },
  });
}
