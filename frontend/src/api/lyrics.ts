import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JobDTO, LyricsCheckDTO, LyricsDoc, SaveLyricsInput, SongDTO } from '@caraoke/shared';
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

export interface LyricsCheckParams {
  artist: string;
  title: string;
  durationSec: number;
}

export function useLyricsCheckQuery({ artist, title, durationSec }: LyricsCheckParams) {
  return useQuery({
    queryKey: ['lyrics-check', artist, title, durationSec],
    queryFn: async () => {
      const params = new URLSearchParams({ artist, title });
      if (durationSec > 0) params.set('duration', String(Math.round(durationSec)));
      return (await apiGet<LyricsCheckDTO>(`/lyrics/check?${params}`)).status;
    },
    enabled: title.trim().length > 0,
    staleTime: Infinity,
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

export function useResyncLyricsMutation() {
  return useMutation({
    mutationFn: (songId: string) => apiSend<JobDTO>('POST', `/songs/${songId}/lyrics/resync`),
  });
}
