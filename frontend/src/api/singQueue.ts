import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSingRequestInput, SingQueueResponse, SingRequestDTO } from '@caraoke/shared';
import { apiGet, apiSend } from './client';

export const SING_QUEUE_QUERY_KEY = ['singQueue'] as const;

export function useSingQueueQuery() {
  return useQuery({
    queryKey: SING_QUEUE_QUERY_KEY,
    queryFn: async () => (await apiGet<SingQueueResponse>('/sing-queue')).items,
  });
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
      queryClient.setQueryData<SingRequestDTO[]>(SING_QUEUE_QUERY_KEY, (current) =>
        current?.filter((request) => request.id !== id),
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: SING_QUEUE_QUERY_KEY }),
  });
}

export function useReorderSingQueueMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) =>
      (await apiSend<SingQueueResponse>('PUT', '/sing-queue/order', { ids })).items,
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: SING_QUEUE_QUERY_KEY });
      queryClient.setQueryData<SingRequestDTO[]>(SING_QUEUE_QUERY_KEY, (current) =>
        current
          ? ids
              .map((id) => current.find((request) => request.id === id))
              .filter((request): request is SingRequestDTO => request !== undefined)
              .map((request, index) => ({ ...request, position: index + 1 }))
          : current,
      );
    },
    onSuccess: (items) => queryClient.setQueryData(SING_QUEUE_QUERY_KEY, items),
    onError: () => queryClient.invalidateQueries({ queryKey: SING_QUEUE_QUERY_KEY }),
  });
}

export function firstReadyRequest(queue: SingRequestDTO[] | undefined): SingRequestDTO | null {
  return queue?.find((request) => request.song.status === 'READY') ?? null;
}

export function singRequestRoute(request: SingRequestDTO): string {
  return `/player/${request.song.id}?pedido=${request.id}`;
}
