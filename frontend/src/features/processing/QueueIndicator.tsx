import { ListMusic } from 'lucide-react';
import { Link } from 'react-router';
import { useJobsQuery } from '../../api/jobs';
import { ProgressRing } from '../../components/ProgressRing';

const BASE_LABEL = 'Fila de processamento';

export function QueueIndicator() {
  const { data } = useJobsQuery('active');
  const count = data?.length ?? 0;
  const running = data?.find((job) => job.status === 'RUNNING');
  const label = count > 0 ? `${BASE_LABEL}: ${count} ${count === 1 ? 'música' : 'músicas'}` : BASE_LABEL;

  return (
    <Link
      to="/fila"
      aria-label={label}
      className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-surface-2"
    >
      {running ? (
        <ProgressRing
          value={running.progress}
          size={34}
          strokeWidth={4}
          label="Progresso da música em processamento"
        >
          {count}
        </ProgressRing>
      ) : (
        <>
          <ListMusic aria-hidden="true" />
          {count > 0 && (
            <span className="absolute right-0.5 top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-contrast">
              {count}
            </span>
          )}
        </>
      )}
    </Link>
  );
}
