import type { QueryClient } from '@tanstack/react-query';
import type { JobDTO, JobStatus, SingRequestDTO, SongDTO, WorkerStatus } from '@caraoke/shared';
import { jobsQueryKey } from '../api/jobs';
import { SING_QUEUE_QUERY_KEY } from '../api/singQueue';
import type { SystemInfo } from '../api/system';

const ACTIVE_STATUSES: JobStatus[] = ['PENDING', 'RUNNING'];

function upsertById(list: JobDTO[], job: JobDTO): JobDTO[] {
  const exists = list.some((item) => item.id === job.id);
  return exists ? list.map((item) => (item.id === job.id ? job : item)) : [...list, job];
}

function withoutJob(list: JobDTO[], jobId: string): JobDTO[] {
  return list.filter((item) => item.id !== jobId);
}

function byPosition(a: JobDTO, b: JobDTO): number {
  return a.position - b.position;
}

function byNewestFinish(a: JobDTO, b: JobDTO): number {
  return (b.finishedAt ?? '').localeCompare(a.finishedAt ?? '');
}

export function applyJobUpdate(queryClient: QueryClient, job: JobDTO): void {
  const isActive = ACTIVE_STATUSES.includes(job.status);

  queryClient.setQueryData<JobDTO[]>(jobsQueryKey('active'), (current) => {
    if (!current) return current;
    return isActive ? upsertById(current, job).sort(byPosition) : withoutJob(current, job.id);
  });

  queryClient.setQueryData<JobDTO[]>(jobsQueryKey('recent'), (current) => {
    if (!current) return current;
    return isActive ? withoutJob(current, job.id) : upsertById(current, job).sort(byNewestFinish);
  });
}

export function applyJobsReordered(queryClient: QueryClient, orderedIds: string[]): void {
  queryClient.setQueryData<JobDTO[]>(jobsQueryKey('active'), (current) => {
    if (!current) return current;
    const reordered = orderedIds
      .map((id) => current.find((job) => job.id === id))
      .filter((job): job is JobDTO => job !== undefined);
    const untouched = current.filter((job) => !orderedIds.includes(job.id));
    return [...untouched, ...reordered].map((job, index) => ({ ...job, position: index + 1 }));
  });
}

export function applySongUpdate(queryClient: QueryClient, song: SongDTO): void {
  queryClient.setQueryData(['song', song.id], song);
  queryClient.setQueryData<SingRequestDTO[]>(SING_QUEUE_QUERY_KEY, (current) =>
    current?.map((request) => (request.song.id === song.id ? { ...request, song } : request)),
  );
  void queryClient.invalidateQueries({ queryKey: ['songs'] });
  void queryClient.invalidateQueries({ queryKey: ['home'] });
}

export function applySongDeleted(queryClient: QueryClient, songId: string): void {
  queryClient.removeQueries({ queryKey: ['song', songId] });
  void queryClient.invalidateQueries({ queryKey: ['songs'] });
  void queryClient.invalidateQueries({ queryKey: ['home'] });
}

export function applyWorkerStatus(queryClient: QueryClient, status: WorkerStatus): void {
  queryClient.setQueryData<SystemInfo>(['system'], (current) =>
    current ? { ...current, worker: { ...current.worker, ...status } } : current,
  );
}

export function applySingQueue(queryClient: QueryClient, items: SingRequestDTO[]): void {
  queryClient.setQueryData(SING_QUEUE_QUERY_KEY, items);
}
