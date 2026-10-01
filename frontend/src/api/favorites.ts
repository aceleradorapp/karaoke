import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FavoritesResponse } from '@caraoke/shared';
import { apiGet, apiSend } from './client';

export function useFavoritesQuery(profileId: string | undefined) {
  return useQuery({
    queryKey: ['favorites', profileId],
    queryFn: () => apiGet<FavoritesResponse>(`/profiles/${profileId}/favorites`),
    enabled: Boolean(profileId),
  });
}

export interface FavoriteChange {
  songId: string;
  isFavorite: boolean;
}

export function useSetFavoriteMutation(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ songId, isFavorite }: FavoriteChange) =>
      apiSend<void>(isFavorite ? 'PUT' : 'DELETE', `/profiles/${profileId}/favorites/${songId}`),
    onSettled: () => {
      for (const key of ['favorites', 'songs', 'song', 'home', 'playlist', 'history']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
