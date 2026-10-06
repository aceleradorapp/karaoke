import { useQueryClient } from '@tanstack/react-query';
import type { JobDTO } from '@caraoke/shared';
import { RotateCcw, Trash2, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  useCancelJobMutation,
  useDeleteJobMutation,
  useJobsQuery,
  useReorderJobsMutation,
  useRetryJobMutation,
} from '../../api/jobs';
import { useSystemInfoQuery } from '../../api/system';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Spinner } from '../../components/Spinner';
import { applyJobsReordered } from '../../realtime/cacheUpdates';
import { toast } from '../../stores/useToastStore';
import { workerLabel } from '../health/workerLabel';
import { describeEta, formatEta } from '../../lib/processingEstimate';
import { JobRow } from './JobRow';
import { PendingList } from './PendingList';
import { useQueueEta } from './useQueueEta';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-muted">{title}</h2>
      {children}
    </section>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

const EMPTY_JOBS: JobDTO[] = [];

type PendingAction = { kind: 'cancel' | 'remove'; job: JobDTO };

const ACTION_DIALOGS = {
  cancel: {
    title: 'Cancelar processamento',
    confirmLabel: 'Cancelar música',
    message: (title: string) =>
      `Cancelar “${title}”? O que já foi processado será perdido, mas você poderá tentar de novo depois.`,
  },
  remove: {
    title: 'Remover da lista',
    confirmLabel: 'Remover',
    message: (title: string) =>
      `Remover “${title}” da lista de concluídas? Isso só tira o registro daqui; a música continua na biblioteca.`,
  },
} as const;

export function QueuePage() {
  const queryClient = useQueryClient();
  const active = useJobsQuery('active');
  const recent = useJobsQuery('recent');
  const system = useSystemInfoQuery();
  const cancelJob = useCancelJobMutation();
  const retryJob = useRetryJobMutation();
  const deleteJob = useDeleteJobMutation();
  const reorderJobs = useReorderJobsMutation();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const eta = useQueueEta(active.data ?? EMPTY_JOBS);
  const etaOf = (job: JobDTO) => {
    const jobEta = eta?.byJob.get(job.id);
    return jobEta ? describeEta(jobEta) : undefined;
  };

  const running = active.data?.filter((job) => job.status === 'RUNNING') ?? [];
  const pending = active.data?.filter((job) => job.status === 'PENDING') ?? [];
  const finished = recent.data ?? [];
  const isLoading = active.isLoading || recent.isLoading;
  const isEmpty = running.length === 0 && pending.length === 0 && finished.length === 0;
  const isWorkerOnline = Boolean(system.data?.worker.online);

  function handleReorder(orderedIds: string[]) {
    applyJobsReordered(queryClient, orderedIds);
    reorderJobs.mutate(orderedIds, {
      onError: (error) => toast.error(errorMessage(error, 'Não foi possível reordenar a fila')),
    });
  }

  function handleCancel(job: JobDTO) {
    cancelJob.mutate(job.id, {
      onError: (error) => toast.error(errorMessage(error, 'Não foi possível cancelar')),
    });
  }

  function handleRetry(job: JobDTO) {
    retryJob.mutate(job.id, {
      onSuccess: () => toast.success('A música voltou para a fila'),
      onError: (error) => toast.error(errorMessage(error, 'Não foi possível tentar de novo')),
    });
  }

  function handleRemove(job: JobDTO) {
    deleteJob.mutate(job.id, {
      onError: (error) => toast.error(errorMessage(error, 'Não foi possível remover')),
    });
  }

  function confirmPendingAction() {
    if (!pendingAction) return;
    if (pendingAction.kind === 'cancel') handleCancel(pendingAction.job);
    else handleRemove(pendingAction.job);
    setPendingAction(null);
  }

  const dialog = pendingAction ? ACTION_DIALOGS[pendingAction.kind] : null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-4xl text-text sm:text-5xl">Fila de processamento</h1>
        {eta && eta.allReadyInSec > 0 && (
          <p className="text-base text-muted">
            Tudo pronto em {formatEta(eta.allReadyInSec)} <span className="text-sm">(estimativa)</span>
          </p>
        )}
      </div>

      {isLoading && <Spinner className="size-8" />}

      {(active.isError || recent.isError) && (
        <p role="alert" className="text-danger">
          Não foi possível carregar a fila.
        </p>
      )}

      {!isLoading && isEmpty && (
        <div className="flex flex-col items-start gap-3 rounded-2xl bg-surface p-6">
          <p className="text-lg">Nada na fila por enquanto.</p>
          <p className="text-muted">Importe músicas do YouTube ou envie arquivos para começar.</p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/youtube"
              className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-primary-contrast"
            >
              Buscar no YouTube
            </Link>
            <Link
              to="/enviar"
              className="inline-flex min-h-11 items-center rounded-lg bg-surface-2 px-5 font-semibold"
            >
              Enviar arquivos
            </Link>
          </div>
        </div>
      )}

      {running.length > 0 && (
        <Section title="Processando agora">
          <ul className="flex flex-col gap-2">
            {running.map((job) => (
              <li key={job.id} className="rounded-2xl bg-surface p-3">
                <JobRow
                  job={job}
                  eta={etaOf(job)}
                  actions={
                    <Button
                      variant="secondary"
                      onClick={() => setPendingAction({ kind: 'cancel', job })}
                      aria-label={`Cancelar ${job.song.title}`}
                    >
                      <X aria-hidden="true" className="size-5" />
                      Cancelar
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {pending.length > 0 && (
        <Section title="Na fila">
          <PendingList
            jobs={pending}
            onReorder={handleReorder}
            onCancel={(job) => setPendingAction({ kind: 'cancel', job })}
            etaOf={etaOf}
          />
        </Section>
      )}

      {finished.length > 0 && (
        <Section title="Concluídas recentemente">
          <ul className="flex flex-col gap-2">
            {finished.map((job) => (
              <li key={job.id} className="rounded-2xl bg-surface p-3">
                <JobRow
                  job={job}
                  actions={
                    <>
                      {job.status !== 'DONE' && (
                        <Button
                          variant="secondary"
                          onClick={() => handleRetry(job)}
                          aria-label={`Tentar de novo ${job.song.title}`}
                        >
                          <RotateCcw aria-hidden="true" className="size-5" />
                          Tentar de novo
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        onClick={() => setPendingAction({ kind: 'remove', job })}
                        aria-label={`Remover ${job.song.title} da lista`}
                      >
                        <Trash2 aria-hidden="true" className="size-5" />
                        Remover
                      </Button>
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <ConfirmDialog
        isOpen={pendingAction !== null}
        title={dialog?.title ?? ''}
        message={pendingAction && dialog ? dialog.message(pendingAction.job.song.title) : ''}
        confirmLabel={dialog?.confirmLabel ?? ''}
        dismissLabel="Voltar"
        onConfirm={confirmPendingAction}
        onCancel={() => setPendingAction(null)}
      />

      <p role="status" className={isWorkerOnline ? 'text-sm text-muted' : 'text-sm text-danger'}>
        {workerLabel(system.data?.worker)}
        {!isWorkerOnline && ': confira se o terminal com “npm run dev” está aberto.'}
      </p>
    </div>
  );
}
