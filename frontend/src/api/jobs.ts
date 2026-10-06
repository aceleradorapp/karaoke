import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JobDTO, ProcessingEstimate } from '@caraoke/shared';
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

const ESTIMATE_STALE_MS = 60_000;

export function useProcessingEstimateQuery(isEnabled: boolean) {
  return useQuery({
    queryKey: [...JOBS_QUERY_KEY, 'estimate'],
    queryFn: () => apiGet<ProcessingEstimate>('/jobs/estimate'),
    staleTime: ESTIMATE_STALE_MS,
    enabled: isEnabled,
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
