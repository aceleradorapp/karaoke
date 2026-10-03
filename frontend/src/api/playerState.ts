import { useQuery } from '@tanstack/react-query';
import type { PlayerStateDTO } from '@caraoke/shared';
import { apiGet } from './client';

export const PLAYER_STATE_QUERY_KEY = ['player', 'state'] as const;

export function usePlayerStateQuery() {
  return useQuery({
    queryKey: PLAYER_STATE_QUERY_KEY,
    queryFn: () => apiGet<PlayerStateDTO | null>('/player/state'),
  });
}
