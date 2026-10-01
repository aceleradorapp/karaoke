import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { HomeResponse, SongDTO, SongListResponse, UpdateSongInput } from '@caraoke/shared';
import { apiGet, apiSend } from './client';

export type SongSort = 'recent' | 'title' | 'artist' | 'popular';
export type SongStatusFilter = 'QUEUED' | 'PROCESSING' | 'READY' | 'ERROR';

export interface SongSearchParams {
  q?: string;
  status?: SongStatusFilter;
  artist?: string;
  sort?: SongSort;
  profileId?: string;
}

function toQueryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function useHomeQuery(profileId: string | undefined) {
  return useQuery({
    queryKey: ['home', profileId],
    queryFn: () => apiGet<HomeResponse>(`/songs/home${toQueryString({ profileId })}`),
  });
}

export function useSongsInfiniteQuery(params: SongSearchParams) {
  return useInfiniteQuery({
    queryKey: ['songs', params],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiGet<SongListResponse>(`/songs${toQueryString({ ...params, cursor: pageParam })}`),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useSongQuery(id: string | undefined, profileId?: string) {
  return useQuery({
    queryKey: ['song', id],
    queryFn: () => apiGet<SongDTO>(`/songs/${id}${toQueryString({ profileId })}`),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useUpdateSongMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: UpdateSongInput) => apiSend<SongDTO>('PATCH', `/songs/${id}`, changes),
    onSuccess: (song) => {
      queryClient.setQueryData(['song', id], song);
      void queryClient.invalidateQueries({ queryKey: ['songs'] });
      void queryClient.invalidateQueries({ queryKey: ['home'] });
    },
  });
}

export function useDeleteSongMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend<void>('DELETE', `/songs/${id}`),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: ['song', id] });
      void queryClient.invalidateQueries({ queryKey: ['songs'] });
      void queryClient.invalidateQueries({ queryKey: ['home'] });
    },
  });
}
