import { EventEmitter } from 'node:events';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { JobDTO } from '@caraoke/shared';
import { jobsQueryKey } from '../api/jobs';
import { SETTINGS_QUERY_KEY } from '../api/settings';
import type { RealtimeSocket } from './socket';
import { useRealtimeSync } from './useRealtimeSync';

class FakeSocket extends EventEmitter {
  override on(event: string, listener: (...args: never[]) => void): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override off(event: string, listener: (...args: never[]) => void): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  totalListeners(): number {
    return this.eventNames().reduce((total, name) => total + this.listenerCount(name), 0);
  }
}

function setup() {
  const socket = new FakeSocket();
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useRealtimeSync(socket as unknown as RealtimeSocket), { wrapper });
  return { socket, queryClient, ...hook };
}

const JOB: JobDTO = {
  id: 'job1',
  songId: 'song1',
  status: 'RUNNING',
  step: 'SEPARATE',
  progress: 42,
  message: 'Separando',
  position: 1,
  device: 'cpu',
  error: null,
  attempts: 1,
  createdAt: '2026-10-01T10:00:00.000Z',
  startedAt: '2026-10-01T10:00:01.000Z',
  finishedAt: null,
  song: { title: 'Evidências', artist: 'X', coverUrl: null },
};

describe('useRealtimeSync', () => {
  it('applies job updates to the cached queue', () => {
    const { socket, queryClient } = setup();
    queryClient.setQueryData(jobsQueryKey('active'), []);

    socket.emit('job:updated', JOB);

    expect(queryClient.getQueryData<JobDTO[]>(jobsQueryKey('active'))).toEqual([JOB]);
  });

  it('keeps the settings cache in sync', () => {
    const { socket, queryClient } = setup();

    socket.emit('settings:updated', { 'processing.device': 'cpu' });

    expect(queryClient.getQueryData(SETTINGS_QUERY_KEY)).toEqual({ 'processing.device': 'cpu' });
  });

  it('refetches the live data every time the connection is (re)established', () => {
    const { socket, queryClient } = setup();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    socket.emit('connect');

    const invalidatedKeys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(invalidatedKeys).toEqual([['jobs'], ['songs'], ['home'], ['system']]);
  });

  it('refreshes the song lists when a song changes or is deleted', () => {
    const { socket, queryClient } = setup();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    socket.emit('song:updated', { id: 'song1' });
    socket.emit('song:deleted', { id: 'song1' });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['songs'] });
    expect(invalidate).toHaveBeenCalledTimes(4);
  });

  it('stops listening when the component goes away', () => {
    const { socket, unmount } = setup();
    expect(socket.totalListeners()).toBe(7);

    unmount();

    expect(socket.totalListeners()).toBe(0);
  });
});
