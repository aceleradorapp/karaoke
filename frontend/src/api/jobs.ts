import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JobDTO } from '@caraoke/shared';
import { apiGet, apiSend } from './client';

export type JobScope = 'active' | 'recent';

export const JOBS_QUERY_KEY = ['jobs'] as const;
export const jobsQueryKey = (scope: JobScope) => [...JOBS_QUERY_KEY, scope] as const;

interface JobListResponse {
  items: JobDTO[];
}

export function useJobsQuery(scope: JobScope) {
  return useQuery({
    queryKey: jobsQueryKey(scope),
    queryFn: async () => (await apiGet<JobListResponse>(`/jobs?scope=${scope}`)).items,
  });
}

export function useCancelJobMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend<void>('POST', `/jobs/${id}/cancel`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY }),
  });
}

export function useRetryJobMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend<JobDTO>('POST', `/jobs/${id}/retry`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY }),
  });
}

export function useDeleteJobMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend<void>('DELETE', `/jobs/${id}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY }),
  });
}

export function useReorderJobsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => apiSend<{ ids: string[] }>('PATCH', '/jobs/reorder', { ids }),
    onError: () => queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY }),
  });
}
