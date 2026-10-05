import {
  COMPETITION_MAX_SONGS_PER_PARTICIPANT,
  type CompetitionDTO,
  type CompetitionScoreRow,
} from '@caraoke/shared';
import { Crown, ImagePlus, ImageOff, ListOrdered, Music, Play, Square, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  useCompetitionQuery,
  useCoverAsImageMutation,
  useDeleteCompetitionMutation,
  useFinishCompetitionMutation,
  useRemoveImageMutation,
  useStartCompetitionMutation,
  useUpdateCompetitionMutation,
  useUploadImageMutation,
} from '../../api/competitions';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { SaveIndicator } from '../../components/SaveIndicator';
import { Spinner } from '../../components/Spinner';
import { useAutoSave } from '../../lib/useAutoSave';
import { toast } from '../../stores/useToastStore';
import { ScoreReveal } from '../player/ScoreReveal';
import { SelectField, SettingsSection, ToggleField } from '../settings/fields';
import { CompetitionImage, STATUS_LABELS } from './CompetitionsPage';
import { ParticipantsBoard } from './ParticipantsBoard';
import { SongPickerModal } from './SongPickerModal';

const MODE_OPTIONS = [
  { value: 'audience', label: 'Só plateia (votos pelo celular)' },
  { value: 'pitch+audience', label: 'Afinação + plateia' },
  { value: 'pitch', label: 'Só afinação (microfone)' },
  { value: 'off', label: 'Sem nota' },
] as const;
const VOTE_OPTIONS = [10, 15, 20, 30, 45, 60].map((seconds) => ({
  value: String(seconds),
  label: `${seconds} s`,
}));
const ADVANCE_OPTIONS = [0, 5, 10, 15, 20, 30, 45, 60].map((seconds) => ({
  value: String(seconds),
  label: seconds === 0 ? 'Desligado' : `Depois de ${seconds} s`,
}));
const SONGS_OPTIONS = Array.from({ length: COMPETITION_MAX_SONGS_PER_PARTICIPANT }, (_, index) => ({
  value: String(index + 1),
  label: `${index + 1} ${index === 0 ? 'música' : 'músicas'} por pessoa`,
}));

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function NameField({ competition }: { competition: CompetitionDTO }) {
  const update = useUpdateCompetitionMutation(competition.id);
  const [name, setName] = useState(competition.name);
  const autoSave = useAutoSave(name.trim(), (value) => update.mutateAsync({ name: value }), {
    delayMs: 600,
    isValid: (value) => value.length > 0,
  });
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className="text-sm text-muted">Nome da disputa</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          className="min-h-12 rounded-lg bg-surface-2 px-4 font-display text-2xl text-text"
        />
      </label>
      <SaveIndicator status={autoSave.status} onRetry={autoSave.retry} />
    </div>
  );
}

function ImageControls({ competition }: { competition: CompetitionDTO }) {
  const upload = useUploadImageMutation(competition.id);
  const useCover = useCoverAsImageMutation(competition.id);
  const remove = useRemoveImageMutation(competition.id);
  const input = useRef<HTMLInputElement>(null);
  const [isPicking, setIsPicking] = useState(false);
  const onError = (error: unknown) => toast.error(errorMessage(error, 'Não foi possível trocar a imagem'));

  return (
    <div className="flex flex-wrap gap-2">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-label="Foto da disputa"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload.mutate(file, { onError });
          event.target.value = '';
        }}
      />
      <Button variant="secondary" onClick={() => input.current?.click()} isLoading={upload.isPending}>
        <ImagePlus aria-hidden="true" className="size-5" />
        Enviar foto
      </Button>
      <Button variant="secondary" onClick={() => setIsPicking(true)} isLoading={useCover.isPending}>
        <Music aria-hidden="true" className="size-5" />
        Usar capa de música
      </Button>
      {competition.imageUrl && (
        <Button variant="ghost" onClick={() => remove.mutate(undefined, { onError })}>
          <ImageOff aria-hidden="true" className="size-5" />
          Tirar imagem
        </Button>
      )}
      <SongPickerModal
        isOpen={isPicking}
        title="Escolha a capa"
        onlyWithCover
        onClose={() => setIsPicking(false)}
        onPick={(song) => {
          setIsPicking(false);
          useCover.mutate(song.id, { onError });
        }}
      />
    </div>
  );
}

function RulesSection({ competition }: { competition: CompetitionDTO }) {
  const update = useUpdateCompetitionMutation(competition.id);
  const rules = competition.rules;
  const isDraft = competition.status === 'DRAFT';
  const save = (changes: Parameters<typeof update.mutate>[0]) =>
    update.mutate(changes, {
      onError: (error) => toast.error(errorMessage(error, 'Não foi possível salvar as regras')),
    });

  return (
    <SettingsSection title="Regras da disputa">
      {isDraft && (
        <SelectField
          id="competition-songs"
          label="Músicas por participante"
          value={String(rules.songsPerParticipant)}
          options={SONGS_OPTIONS}
          onChange={(value) => save({ songsPerParticipant: Number(value) })}
        />
      )}
      <SelectField
        id="competition-mode"
        label="Como dar a nota"
        value={rules.scoringMode}
        options={[...MODE_OPTIONS]}
        onChange={(value) => save({ scoringMode: value })}
      />
      <SelectField
        id="competition-vote"
        label="Tempo para votar"
        value={String(rules.voteSeconds)}
        options={VOTE_OPTIONS}
        onChange={(value) => save({ voteSeconds: Number(value) })}
      />
      <SelectField
        id="competition-advance"
        label="Chamar o próximo cantor"
        value={String(rules.autoAdvanceSeconds)}
        options={ADVANCE_OPTIONS}
        onChange={(value) => save({ autoAdvanceSeconds: Number(value) })}
      />
      <ToggleField
        label="Aleatório (sortear quem canta)"
        checked={rules.shuffle}
        onChange={(shuffle) => save({ shuffle })}
      />
    </SettingsSection>
  );
}

function Scoreboard({ rows }: { rows: CompetitionScoreRow[] }) {
  return (
    <section aria-label="Placar" className="flex flex-col gap-3 rounded-2xl bg-surface p-4 sm:p-6">
      <h2 className="text-2xl font-semibold">Placar</h2>
      <ol className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <li key={row.profile.id} className="flex min-h-12 items-center gap-3">
            <span className="w-6 shrink-0 text-center text-lg font-semibold text-muted">{index + 1}</span>
            <Avatar avatarId={row.profile.avatar} size="sm" />
            <span className="min-w-0 flex-1 truncate text-lg">{row.profile.name}</span>
            <span className="shrink-0 text-sm text-muted">
              cantou {row.sung} de {row.total}
            </span>
            <span className="w-16 shrink-0 text-right font-display text-2xl tabular-nums">
              {row.avg ?? '—'}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Winner({ competition }: { competition: CompetitionDTO }) {
  const champion = competition.scoreboard[0];
  if (!champion || champion.avg === null) {
    return <p className="rounded-2xl bg-surface p-4 text-base text-muted">A disputa terminou sem notas.</p>;
  }
  return (
    <section
      aria-label="Campeão"
      className="flex flex-col items-center gap-3 rounded-2xl bg-surface p-6 text-center ring-2 ring-primary"
    >
      <Crown aria-hidden="true" className="size-12 text-yellow-400" />
      <Avatar avatarId={champion.profile.avatar} size="xl" />
      <p className="font-display text-4xl">{champion.profile.name} venceu!</p>
      <ScoreReveal
        result={{
          performanceId: competition.id,
          pitchScore: null,
          audienceScore: null,
          finalScore: champion.avg,
          votes: 0,
        }}
      />
    </section>
  );
}

function CompetitionView({ competition }: { competition: CompetitionDTO }) {
  const navigate = useNavigate();
  const start = useStartCompetitionMutation(competition.id);
  const finish = useFinishCompetitionMutation(competition.id);
  const remove = useDeleteCompetitionMutation();
  const [confirming, setConfirming] = useState<'finish' | 'delete' | null>(null);
  const totalSongs = competition.participants.reduce((sum, participant) => sum + participant.songs.length, 0);
  const canStart = competition.participants.length >= 2 && totalSongs > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:items-start">
        <CompetitionImage competition={competition} className="aspect-video w-full rounded-2xl" />
        <div className="flex min-w-0 flex-col gap-3">
          <span className="self-start rounded-full bg-surface-2 px-3 text-sm">
            {STATUS_LABELS[competition.status]}
          </span>
          {competition.status === 'FINISHED' ? (
            <h1 className="font-display text-4xl">{competition.name}</h1>
          ) : (
            <NameField key={competition.id} competition={competition} />
          )}
          {competition.status !== 'FINISHED' && <ImageControls competition={competition} />}
        </div>
      </div>

      {competition.status === 'DRAFT' && (
        <>
          <ParticipantsBoard competition={competition} />
          <RulesSection competition={competition} />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              disabled={!canStart}
              isLoading={start.isPending}
              onClick={() =>
                start.mutate(undefined, {
                  onSuccess: () => navigate('/proximos'),
                  onError: (error) => toast.error(errorMessage(error, 'Não foi possível começar')),
                })
              }
            >
              <Play aria-hidden="true" className="size-5" />
              Começar a disputa
            </Button>
            {!canStart && (
              <span className="text-sm text-muted">
                Precisa de pelo menos 2 participantes e das músicas de cada um.
              </span>
            )}
          </div>
        </>
      )}

      {competition.status === 'RUNNING' && (
        <>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/proximos"
              className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-primary px-6 text-lg font-semibold text-primary-contrast"
            >
              <ListOrdered aria-hidden="true" className="size-5" />
              Ir para a fila
            </Link>
            <Button variant="secondary" size="lg" onClick={() => setConfirming('finish')}>
              <Square aria-hidden="true" className="size-5" />
              Encerrar disputa
            </Button>
          </div>
          <Scoreboard rows={competition.scoreboard} />
          <RulesSection competition={competition} />
        </>
      )}

      {competition.status === 'FINISHED' && (
        <>
          <Winner competition={competition} />
          <Scoreboard rows={competition.scoreboard} />
        </>
      )}

      {competition.status !== 'RUNNING' && (
        <section aria-label="Zona de risco">
          <Button variant="danger" onClick={() => setConfirming('delete')}>
            <Trash2 aria-hidden="true" className="size-5" />
            Apagar disputa
          </Button>
        </section>
      )}

      <ConfirmDialog
        isOpen={confirming === 'finish'}
        title="Encerrar disputa"
        message="Os pedidos que ainda não foram cantados saem da fila e o placar fica como está. Encerrar agora?"
        confirmLabel="Encerrar"
        dismissLabel="Continuar"
        onConfirm={() => {
          setConfirming(null);
          finish.mutate(undefined, {
            onError: (error) => toast.error(errorMessage(error, 'Não foi possível encerrar')),
          });
        }}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        isOpen={confirming === 'delete'}
        title="Apagar disputa"
        message={`Apagar “${competition.name}”? As notas continuam no histórico de cada pessoa.`}
        confirmLabel="Apagar"
        dismissLabel="Cancelar"
        onConfirm={() => {
          setConfirming(null);
          remove.mutate(competition.id, {
            onSuccess: () => navigate('/disputas'),
            onError: (error) => toast.error(errorMessage(error, 'Não foi possível apagar')),
          });
        }}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}

export function CompetitionPage() {
  const { id } = useParams();
  const competition = useCompetitionQuery(id);

  if (competition.isLoading) return <Spinner className="mx-auto mt-10 size-10" />;
  if (competition.isError || !competition.data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="font-display text-4xl">Disputa não encontrada</h1>
        <Link to="/disputas" className="text-primary underline">
          Voltar para as disputas
        </Link>
      </div>
    );
  }
  return <CompetitionView competition={competition.data} />;
}
