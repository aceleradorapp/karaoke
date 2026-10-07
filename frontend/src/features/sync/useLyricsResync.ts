import type { JobDTO, SongDTO } from '@caraoke/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useJobsQuery } from '../../api/jobs';
import { useResyncLyricsMutation } from '../../api/lyrics';
import { toast } from '../../stores/useToastStore';

const ACTIVE = new Set(['PENDING', 'RUNNING']);

function activeResyncOf(song: SongDTO): string | null {
  const job = song.job;
  return job && job.kind === 'RESYNC' && ACTIVE.has(job.status) ? job.id : null;
}

export interface LyricsResync {
  job: JobDTO | null;
  isRunning: boolean;
  isStarting: boolean;
  isWaitingForLyrics: boolean;
  generation: number;
  start: () => void;
}

export function useLyricsResync(song: SongDTO, isFreshLyrics: boolean): LyricsResync {
  const queryClient = useQueryClient();
  const resync = useResyncLyricsMutation();
  const active = useJobsQuery('active');
  const recent = useJobsQuery('recent');
  const [jobId, setJobId] = useState<string | null>(() => activeResyncOf(song));
  const [startedJob, setStartedJob] = useState<JobDTO | null>(null);
  const [urlBefore, setUrlBefore] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const handledJob = useRef<string | null>(null);

  const job =
    active.data?.find((item) => item.id === jobId) ??
    recent.data?.find((item) => item.id === jobId) ??
    (startedJob?.id === jobId ? startedJob : null);

  useEffect(() => {
    if (!job || ACTIVE.has(job.status) || handledJob.current === job.id) return;
    handledJob.current = job.id;
    setJobId(null);
    void queryClient.invalidateQueries({ queryKey: ['song', song.id] });
    void queryClient.invalidateQueries({ queryKey: ['lyrics-original', song.id] });
    if (job.status === 'DONE') toast.success('Sincronização refeita com a voz');
    else {
      setUrlBefore(null);
      toast.error(job.error ? `Não deu para refazer: ${job.error}` : 'A sincronização foi cancelada');
    }
  }, [job, queryClient, song.id]);

  const isWaitingForLyrics = urlBefore !== null && jobId === null && (song.lyricsUrl === urlBefore || !isFreshLyrics);

  useEffect(() => {
    if (urlBefore === null || jobId !== null || isWaitingForLyrics) return;
    setUrlBefore(null);
    setGeneration((value) => value + 1);
  }, [urlBefore, jobId, isWaitingForLyrics]);

  function start() {
    resync.mutate(song.id, {
      onSuccess: (created) => {
        setStartedJob(created);
        setUrlBefore(song.lyricsUrl);
        setJobId(created.id);
      },
      onError: (error) => toast.error(error instanceof Error ? error.message : 'Não foi possível refazer'),
    });
  }

  return {
    job,
    isRunning: jobId !== null,
    isStarting: resync.isPending,
    isWaitingForLyrics,
    generation,
    start,
  };
}
