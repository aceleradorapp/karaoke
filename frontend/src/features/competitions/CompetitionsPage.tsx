import type { CompetitionStatus, CompetitionSummary } from '@caraoke/shared';
import clsx from 'clsx';
import { Plus, Trophy } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useCompetitionsQuery, useCreateCompetitionMutation } from '../../api/competitions';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { Spinner } from '../../components/Spinner';
import { coverGradient } from '../../lib/gradient';
import { toast } from '../../stores/useToastStore';

export const STATUS_LABELS: Record<CompetitionStatus, string> = {
  DRAFT: 'Rascunho',
  RUNNING: 'Em andamento',
  FINISHED: 'Encerrada',
};

export function CompetitionImage({
  competition,
  className,
}: {
  competition: Pick<CompetitionSummary, 'id' | 'imageUrl'>;
  className?: string;
}) {
  return competition.imageUrl ? (
    <img src={competition.imageUrl} alt="" className={clsx('object-cover', className)} />
  ) : (
    <div
      aria-hidden="true"
      style={{ background: coverGradient(competition.id) }}
      className={clsx('flex items-center justify-center', className)}
    >
      <Trophy className="size-1/3 text-white/80" />
    </div>
  );
}

function NewCompetitionModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const create = useCreateCompetitionMutation();
  const [name, setName] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      const competition = await create.mutateAsync(name.trim());
      navigate(`/disputas/${competition.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar a disputa');
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      title="Nova disputa"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="new-competition" disabled={!name.trim()} isLoading={create.isPending}>
            Criar
          </Button>
        </>
      }
    >
      <form id="new-competition" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-muted">Nome da disputa</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            autoFocus
            placeholder="Ex.: Noite das Divas"
            className="min-h-11 rounded-lg bg-surface-2 px-4 text-base text-text"
          />
        </label>
      </form>
    </Modal>
  );
}

export function CompetitionsPage() {
  const competitions = useCompetitionsQuery();
  const [isCreating, setIsCreating] = useState(false);
  const items = competitions.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl">Disputas</h1>
        <Button onClick={() => setIsCreating(true)}>
          <Plus aria-hidden="true" className="size-5" />
          Nova disputa
        </Button>
      </div>

      {competitions.isLoading && <Spinner className="mx-auto size-10" />}
      {competitions.isError && (
        <p role="alert" className="text-danger">
          Não foi possível carregar as disputas.
        </p>
      )}
      {competitions.isSuccess && items.length === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-2xl bg-surface p-6">
          <p className="text-xl">Nenhuma disputa ainda.</p>
          <p className="text-base text-muted">
            Crie uma disputa, escolha quem participa e quantas músicas cada um canta. A nota decide quem
            ganha.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((competition) => (
            <li key={competition.id}>
              <Link
                to={`/disputas/${competition.id}`}
                className="flex h-full flex-col overflow-hidden rounded-2xl bg-surface transition hover:ring-2 hover:ring-primary"
              >
                <CompetitionImage competition={competition} className="aspect-video w-full" />
                <div className="flex flex-col gap-1 p-4">
                  <span className="truncate text-xl font-semibold">{competition.name}</span>
                  <span className="text-sm text-muted">
                    {STATUS_LABELS[competition.status]} · {competition.participantsCount}{' '}
                    {competition.participantsCount === 1 ? 'participante' : 'participantes'}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <NewCompetitionModal isOpen={isCreating} onClose={() => setIsCreating(false)} />
    </div>
  );
}
