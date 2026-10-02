import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { SingQueueResponse } from '@caraoke/shared';
import { SETTINGS_QUERY_KEY } from '../api/settings';
import {
  applyJobUpdate,
  applyJobsReordered,
  applySingQueue,
  applySongDeleted,
  applySongUpdate,
  applyWorkerStatus,
} from './cacheUpdates';
import { getSocket, type RealtimeSocket } from './socket';

const RESYNC_QUERY_KEYS = [['jobs'], ['songs'], ['home'], ['system'], ['singQueue']] as const;

export function useRealtimeSync(socket: RealtimeSocket = getSocket()): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const resync = () => {
      for (const queryKey of RESYNC_QUERY_KEYS) void queryClient.invalidateQueries({ queryKey });
    };
    const onJobUpdated = (job: Parameters<typeof applyJobUpdate>[1]) => applyJobUpdate(queryClient, job);
    const onJobsReordered = ({ ids }: { ids: string[] }) => applyJobsReordered(queryClient, ids);
    const onSongUpdated = (song: Parameters<typeof applySongUpdate>[1]) => applySongUpdate(queryClient, song);
    const onSongDeleted = ({ id }: { id: string }) => applySongDeleted(queryClient, id);
    const onSingQueue = ({ items }: SingQueueResponse) => applySingQueue(queryClient, items);
    const onWorkerStatus = (status: Parameters<typeof applyWorkerStatus>[1]) =>
      applyWorkerStatus(queryClient, status);
    const onSettingsUpdated = (settings: unknown) => queryClient.setQueryData(SETTINGS_QUERY_KEY, settings);

    socket.on('connect', resync);
    socket.on('job:updated', onJobUpdated);
    socket.on('jobs:reordered', onJobsReordered);
    socket.on('song:updated', onSongUpdated);
    socket.on('song:deleted', onSongDeleted);
    socket.on('singQueue:changed', onSingQueue);
    socket.on('worker:status', onWorkerStatus);
    socket.on('settings:updated', onSettingsUpdated);

    return () => {
      socket.off('connect', resync);
      socket.off('job:updated', onJobUpdated);
      socket.off('jobs:reordered', onJobsReordered);
      socket.off('song:updated', onSongUpdated);
      socket.off('song:deleted', onSongDeleted);
      socket.off('singQueue:changed', onSingQueue);
      socket.off('worker:status', onWorkerStatus);
      socket.off('settings:updated', onSettingsUpdated);
    };
  }, [queryClient, socket]);
}
