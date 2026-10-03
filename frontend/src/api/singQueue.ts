import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSingRequestInput, SingQueueResponse, SingRequestDTO } from '@caraoke/shared';
import { apiGet, apiSend } from './client';

export const SING_QUEUE_QUERY_KEY = ['singQueue'] as const;

export function useSingQueueQuery() {
  return useQuery({
    queryKey: SING_QUEUE_QUERY_KEY,
    queryFn: () => apiGet<SingQueueResponse>('/sing-queue'),
  });
}

function withItems(
  queue: SingQueueResponse | undefined,
  change: (items: SingRequestDTO[]) => SingRequestDTO[],
): SingQueueResponse | undefined {
  return queue ? { ...queue, items: change(queue.items) } : queue;
}

export function useAddSingRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSingRequestInput) => apiSend<SingRequestDTO>('POST', '/sing-queue', input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: SING_QUEUE_QUERY_KEY }),
  });
}

interface RemoveSingRequestVariables {
  id: string;
  profileId?: string;
}

export function useRemoveSingRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, profileId }: RemoveSingRequestVariables) => {
      const query = profileId ? `?profileId=${encodeURIComponent(profileId)}` : '';
      return apiSend<void>('DELETE', `/sing-queue/${id}${query}`);
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: SING_QUEUE_QUERY_KEY });
      queryClient.setQueryData<SingQueueResponse>(SING_QUEUE_QUERY_KEY, (current) =>
        withItems(current, (items) => items.filter((request) => request.id !== id)),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: SING_QUEUE_QUERY_KEY }),
  });
}

export function useReorderSingQueueMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => apiSend<SingQueueResponse>('PUT', '/sing-queue/order', { ids }),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: SING_QUEUE_QUERY_KEY });
      queryClient.setQueryData<SingQueueResponse>(SING_QUEUE_QUERY_KEY, (current) =>
        withItems(current, (items) =>
          ids
            .map((id) => items.find((request) => request.id === id))
            .filter((request): request is SingRequestDTO => request !== undefined)
            .map((request, index) => ({ ...request, position: index + 1 })),
        ),
      );
    },
    onSuccess: (queue) => queryClient.setQueryData(SING_QUEUE_QUERY_KEY, queue),
    onError: () => queryClient.invalidateQueries({ queryKey: SING_QUEUE_QUERY_KEY }),
  });
}

export function nextRequestOf(
  queue: SingQueueResponse | undefined,
  excludedId: string | null = null,
): SingRequestDTO | null {
  if (!queue) return null;
  const chosen = queue.items.find((request) => request.id === queue.nextId && request.id !== excludedId);
  if (chosen) return chosen;
  return queue.items.find((request) => request.song.status === 'READY' && request.id !== excludedId) ?? null;
}

export function singRequestRoute(request: SingRequestDTO): string {
  return `/player/${request.song.id}?pedido=${request.id}`;
}
