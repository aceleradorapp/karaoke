import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateProfileInput, ProfileDTO, UpdateProfileInput } from '@caraoke/shared';
import { apiGet, apiSend } from './client';

export const PROFILES_QUERY_KEY = ['profiles'] as const;

interface ProfileListResponse {
  items: ProfileDTO[];
}

export function useProfilesQuery() {
  return useQuery({
    queryKey: PROFILES_QUERY_KEY,
    queryFn: async () => (await apiGet<ProfileListResponse>('/profiles')).items,
  });
}

export function useCreateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProfileInput) => apiSend<ProfileDTO>('POST', '/profiles', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROFILES_QUERY_KEY }),
  });
}

export function useTouchProfileMutation() {
  return useMutation({
    mutationFn: (id: string) => apiSend<ProfileDTO>('POST', `/profiles/${id}/touch`),
  });
}

interface UpdateProfileVariables {
  id: string;
  changes: UpdateProfileInput;
}

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: UpdateProfileVariables) =>
      apiSend<ProfileDTO>('PATCH', `/profiles/${id}`, changes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROFILES_QUERY_KEY }),
  });
}

export function useDeleteProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend<void>('DELETE', `/profiles/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROFILES_QUERY_KEY }),
  });
}
