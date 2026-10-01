import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { PlaylistDetailDTO, PlaylistListResponse, PlaylistSummaryDTO } from '@caraoke/shared';
import { apiGet, apiSend } from './client';

export function invalidatePlaylists(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['playlists'] });
  void queryClient.invalidateQueries({ queryKey: ['playlist'] });
}

export function usePlaylistsQuery(profileId: string | undefined, songId?: string) {
  return useQuery({
    queryKey: ['playlists', profileId, songId ?? null],
    queryFn: () =>
      apiGet<PlaylistListResponse>(
        `/profiles/${profileId}/playlists${songId ? `?songId=${encodeURIComponent(songId)}` : ''}`,
      ),
    enabled: Boolean(profileId),
  });
}

export function usePlaylistQuery(id: string | undefined) {
  return useQuery({
    queryKey: ['playlist', id],
    queryFn: () => apiGet<PlaylistDetailDTO>(`/playlists/${id}`),
    enabled: Boolean(id),
    retry: false,
  });
}

export function useCreatePlaylistMutation(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiSend<PlaylistSummaryDTO>('POST', `/profiles/${profileId}/playlists`, { name }),
    onSuccess: () => invalidatePlaylists(queryClient),
  });
}

export function useRenamePlaylistMutation(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiSend<PlaylistSummaryDTO>('PATCH', `/playlists/${id}`, { name }),
    onSuccess: (renamed) => {
      queryClient.setQueryData<PlaylistDetailDTO>(['playlist', id], (current) =>
        current ? { ...current, name: renamed.name } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['playlists'] });
    },
  });
}

export function useDeletePlaylistMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend<void>('DELETE', `/playlists/${id}`),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: ['playlist', id] });
      invalidatePlaylists(queryClient);
    },
  });
}

export interface PlaylistSongChange {
  playlistId: string;
  songId: string;
  isAdding: boolean;
}

export function useChangePlaylistSongMutation(profileId: string | undefined, songId: string) {
  const queryClient = useQueryClient();
  const listKey = ['playlists', profileId, songId];

  return useMutation({
    mutationFn: ({ playlistId, isAdding }: PlaylistSongChange) =>
      isAdding
        ? apiSend<void>('POST', `/playlists/${playlistId}/items`, { songId })
        : apiSend<void>('DELETE', `/playlists/${playlistId}/items/${songId}`),
    onMutate: async ({ playlistId, isAdding }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<PlaylistListResponse>(listKey);
      queryClient.setQueryData<PlaylistListResponse>(listKey, (current) =>
        current
          ? {
              items: current.items.map((playlist) =>
                playlist.id === playlistId
                  ? {
                      ...playlist,
                      containsSong: isAdding,
                      count: Math.max(0, playlist.count + (isAdding ? 1 : -1)),
                    }
                  : playlist,
              ),
            }
          : current,
      );
      return { previous };
    },
    onError: (_error, _change, context) => {
      if (context?.previous) queryClient.setQueryData(listKey, context.previous);
    },
    onSettled: () => invalidatePlaylists(queryClient),
  });
}

export function useRemovePlaylistItemMutation(playlistId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (songId: string) => apiSend<void>('DELETE', `/playlists/${playlistId}/items/${songId}`),
    onSuccess: () => invalidatePlaylists(queryClient),
  });
}

export function useReorderPlaylistMutation(playlistId: string) {
  const queryClient = useQueryClient();
  const key = ['playlist', playlistId];

  return useMutation({
    mutationFn: (songIds: string[]) =>
      apiSend<void>('PATCH', `/playlists/${playlistId}/items/reorder`, { songIds }),
    onMutate: async (songIds) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PlaylistDetailDTO>(key);
      queryClient.setQueryData<PlaylistDetailDTO>(key, (current) => {
        if (!current) return current;
        const bySongId = new Map(current.items.map((song) => [song.id, song]));
        const ordered = songIds.flatMap((id) => bySongId.get(id) ?? []);
        return { ...current, items: ordered };
      });
      return { previous };
    },
    onError: (_error, _songIds, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
}
