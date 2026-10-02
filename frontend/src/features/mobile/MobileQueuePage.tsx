import type { SingRequestDTO } from '@caraoke/shared';
import clsx from 'clsx';
import { Link } from 'react-router';
import { useJobsQuery } from '../../api/jobs';
import { useRemoveSingRequestMutation, useSingQueueQuery } from '../../api/singQueue';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { useMobileProfileStore } from '../../stores/useMobileProfileStore';
import { toast } from '../../stores/useToastStore';
import { JobRow } from '../processing/JobRow';

const RECENT_LIMIT = 5;

function SingQueueRow({
  request,
  isMine,
  profileId,
}: {
  request: SingRequestDTO;
  isMine: boolean;
  profileId?: string;
}) {
  const removeRequest = useRemoveSingRequestMutation();

  return (
    <li
      className={clsx('flex items-center gap-3 rounded-2xl bg-surface p-3', isMine && 'ring-2 ring-primary')}
    >
      <span className="w-6 shrink-0 text-center text-lg font-semibold text-muted">{request.position}</span>
      <Avatar avatarId={request.profile.avatar} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold">
          {isMine ? `${request.profile.name} (você)` : request.profile.name}
        </p>
        <p className="truncate text-sm text-muted">
          {request.song.title} — {request.song.artist}
        </p>
        {request.song.status !== 'READY' && <p className="text-sm text-primary">preparando…</p>}
      </div>
      {isMine && profileId && (
        <Button
          variant="ghost"
          aria-label={`Tirar ${request.song.title} da fila`}
          isLoading={removeRequest.isPending}
          onClick={() =>
            removeRequest.mutate(
              { id: request.id, profileId },
              {
                onError: (error) =>
                  toast.error(error instanceof Error ? error.message : 'Não foi possível tirar da fila'),
              },
            )
          }
        >
          Tirar
        </Button>
      )}
    </li>
  );
}

function SingQueueSection() {
  const profileId = useMobileProfileStore((state) => state.profile?.id);
  const queue = useSingQueueQuery();
  const requests = queue.data ?? [];

  return (
    <section aria-label="Próximos a cantar" className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Próximos a cantar</h2>
      {queue.isLoading && <Spinner className="mx-auto size-6" />}
      {queue.isError && (
        <p role="alert" className="text-danger">
          Não foi possível carregar quem vai cantar.
        </p>
      )}
      {queue.isSuccess && requests.length === 0 && (
        <div className="flex flex-col items-start gap-2 rounded-2xl bg-surface p-4">
          <p className="text-base">Ninguém na fila para cantar.</p>
          <Link to="/m/musicas" className="min-h-11 content-center text-base text-primary underline">
            Escolher uma música
          </Link>
        </div>
      )}
      {requests.length > 0 && (
        <ol className="flex flex-col gap-2">
          {requests.map((request) => (
            <SingQueueRow
              key={request.id}
              request={request}
              isMine={request.profile.id === profileId}
              profileId={profileId}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

export function MobileQueuePage() {
  const active = useJobsQuery('active');
  const recent = useJobsQuery('recent');
  const activeJobs = active.data ?? [];
  const recentJobs = (recent.data ?? []).slice(0, RECENT_LIMIT);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl">Fila</h1>

      <SingQueueSection />

      <section aria-label="Preparando" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Preparando</h2>
        {active.isLoading && <Spinner className="mx-auto size-6" />}
        {active.isError && (
          <p role="alert" className="text-danger">
            Não foi possível carregar a fila.
          </p>
        )}
        {active.isSuccess && activeJobs.length === 0 && (
          <div className="flex flex-col items-start gap-2 rounded-2xl bg-surface p-4">
            <p className="text-base">Nenhuma música sendo preparada agora.</p>
            <Link to="/m/buscar" className="min-h-11 content-center text-base text-primary underline">
              Buscar uma música
            </Link>
          </div>
        )}
        {activeJobs.length > 0 && (
          <ul className="flex flex-col gap-2">
            {activeJobs.map((job) => (
              <li key={job.id} className="rounded-2xl bg-surface p-3">
                <JobRow job={job} />
              </li>
            ))}
          </ul>
        )}
      </section>

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
