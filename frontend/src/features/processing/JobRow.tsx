import type { JobDTO } from '@caraoke/shared';
import { Music } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatTimeAgo } from '../../lib/format';
import { STEP_LABELS, friendlyJobError } from './jobText';

const PERCENT = 100;

function describeStatus(job: JobDTO): string {
  switch (job.status) {
    case 'PENDING':
      return 'Aguardando';
    case 'RUNNING':
      return job.message ?? (job.step ? STEP_LABELS[job.step] : 'Processando');
    case 'DONE':
      return `Pronta · ${formatTimeAgo(job.finishedAt ?? job.createdAt)}`;
    case 'FAILED':
      return `Falhou: ${friendlyJobError(job.error)}`;
    case 'CANCELED':
      return 'Cancelada';
  }
}

interface JobRowProps {
  job: JobDTO;
  leading?: ReactNode;
  actions?: ReactNode;
}

export function JobRow({ job, leading, actions }: JobRowProps) {
  const isRunning = job.status === 'RUNNING';
  const isFailed = job.status === 'FAILED';

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {leading}
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2 sm:size-16">
          {job.song.coverUrl ? (
            <img src={job.song.coverUrl} alt="" className="size-full object-cover" />
          ) : (
            <Music aria-hidden="true" className="size-6 text-muted" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-base font-semibold">{job.song.title}</p>
          <p className="truncate text-sm text-muted">{job.song.artist}</p>
          <p
            className={isFailed ? 'text-sm text-danger' : 'text-sm text-muted'}
            title={isFailed && job.error ? job.error : undefined}
          >
            {describeStatus(job)}
            {isRunning && job.device && (
              <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs">{job.device}</span>
            )}
          </p>
          {isRunning && (
            <div
              role="progressbar"
              aria-label={`Processando ${job.song.title}`}
              aria-valuemin={0}
              aria-valuemax={PERCENT}
              aria-valuenow={job.progress}
              className="h-2 overflow-hidden rounded-full bg-surface-2"
            >
              <div className="h-full bg-primary transition-[width]" style={{ width: `${job.progress}%` }} />
            </div>
          )}
        </div>
      </div>

      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}
