import { Link } from 'react-router';
import { useJobsQuery } from '../../api/jobs';
import { Spinner } from '../../components/Spinner';
import { JobRow } from '../processing/JobRow';

const RECENT_LIMIT = 5;

export function MobileQueuePage() {
  const active = useJobsQuery('active');
  const recent = useJobsQuery('recent');
  const activeJobs = active.data ?? [];
  const recentJobs = (recent.data ?? []).slice(0, RECENT_LIMIT);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl">Fila</h1>

      {active.isLoading && <Spinner className="mx-auto size-8" />}
      {active.isError && (
        <p role="alert" className="text-danger">
          Não foi possível carregar a fila.
        </p>
      )}

      {active.isSuccess && activeJobs.length === 0 && (
        <div className="flex flex-col items-start gap-2 rounded-2xl bg-surface p-4">
          <p className="text-base">Nada na fila agora.</p>
          <Link to="/m/buscar" className="min-h-11 content-center text-base text-primary underline">
            Buscar uma música
          </Link>
        </div>
      )}

      {activeJobs.length > 0 && (
        <section aria-label="Na fila" className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Na fila</h2>
          <ul className="flex flex-col gap-2">
            {activeJobs.map((job) => (
              <li key={job.id} className="rounded-2xl bg-surface p-3">
                <JobRow job={job} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {recentJobs.length > 0 && (
        <section aria-label="Terminadas há pouco" className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Terminadas há pouco</h2>
          <ul className="flex flex-col gap-2">
            {recentJobs.map((job) => (
              <li key={job.id} className="rounded-2xl bg-surface p-3">
                <JobRow job={job} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
