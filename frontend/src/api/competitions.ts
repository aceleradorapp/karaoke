import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CompetitionDTO, CompetitionSummary, UpdateCompetitionInput } from '@caraoke/shared';
import { apiGet, apiSend, accessHeaders, ApiError } from './client';

export const COMPETITIONS_QUERY_KEY = ['competitions'] as const;
export const competitionQueryKey = (id: string) => ['competition', id] as const;

export function useCompetitionsQuery() {
  return useQuery({
    queryKey: COMPETITIONS_QUERY_KEY,
    queryFn: async () => (await apiGet<{ items: CompetitionSummary[] }>('/competitions')).items,
  });
}

export function useCompetitionQuery(id: string | undefined) {
  return useQuery({
    queryKey: competitionQueryKey(id ?? ''),
    queryFn: () => apiGet<CompetitionDTO>(`/competitions/${id}`),
    enabled: Boolean(id),
    retry: false,
  });
}

function useCompetitionMutation<TVariables>(
  id: string,
  request: (variables: TVariables) => Promise<CompetitionDTO>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (competition) => {
      queryClient.setQueryData(competitionQueryKey(id), competition);
      void queryClient.invalidateQueries({ queryKey: COMPETITIONS_QUERY_KEY });
    },
  });
}

export function useCreateCompetitionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiSend<CompetitionDTO>('POST', '/competitions', { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COMPETITIONS_QUERY_KEY }),
  });
}

export function useUpdateCompetitionMutation(id: string) {
  return useCompetitionMutation(id, (changes: UpdateCompetitionInput) =>
    apiSend<CompetitionDTO>('PATCH', `/competitions/${id}`, changes),
  );
}

export function useSetParticipantsMutation(id: string) {
  return useCompetitionMutation(id, (profileIds: string[]) =>
    apiSend<CompetitionDTO>('PUT', `/competitions/${id}/participants`, { profileIds }),
  );
}

export function useAddCompetitionSongMutation(id: string) {
  return useCompetitionMutation(id, (input: { profileId: string; songId: string }) =>
    apiSend<CompetitionDTO>('POST', `/competitions/${id}/songs`, input),
  );
}

export function useRemoveCompetitionSongMutation(id: string) {
  return useCompetitionMutation(id, (entryId: string) =>
    apiSend<CompetitionDTO>('DELETE', `/competitions/${id}/songs/${entryId}`),
  );
}

export function useStartCompetitionMutation(id: string) {
  return useCompetitionMutation(id, () => apiSend<CompetitionDTO>('POST', `/competitions/${id}/start`));
}

export function useFinishCompetitionMutation(id: string) {
  return useCompetitionMutation(id, () => apiSend<CompetitionDTO>('POST', `/competitions/${id}/finish`));
}

export function useDeleteCompetitionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend<void>('DELETE', `/competitions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COMPETITIONS_QUERY_KEY }),
  });
}

export function useCoverAsImageMutation(id: string) {
  return useCompetitionMutation(id, (songId: string) =>
    apiSend<CompetitionDTO>('POST', `/competitions/${id}/image/from-song`, { songId }),
  );
}

export function useRemoveImageMutation(id: string) {
  return useCompetitionMutation(id, () => apiSend<CompetitionDTO>('DELETE', `/competitions/${id}/image`));
}

async function uploadImage(id: string, file: File): Promise<CompetitionDTO> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`/api/competitions/${id}/image`, {
    method: 'POST',
    body: form,
    headers: accessHeaders(),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as { error?: { code: string; message: string } } | null)?.error;
    throw new ApiError(
      error?.code ?? 'UPLOAD_FAILED',
      error?.message ?? 'Não foi possível enviar a imagem',
      response.status,
    );
  }
  return body as CompetitionDTO;
}

export function useUploadImageMutation(id: string) {
  return useCompetitionMutation(id, (file: File) => uploadImage(id, file));
}
