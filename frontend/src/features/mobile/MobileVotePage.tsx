import type { VotingSummary } from '@caraoke/shared';
import clsx from 'clsx';
import { Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ApiError } from '../../api/client';
import { useCastVoteMutation, useCurrentVotingQuery, useFinalScoreQuery } from '../../api/voting';
import { Avatar } from '../../components/Avatar';
import { Spinner } from '../../components/Spinner';
import { voterToken } from '../../lib/voterToken';
import { useMobileProfileStore } from '../../stores/useMobileProfileStore';
import { toast } from '../../stores/useToastStore';

const STARS = 5;
const TICK_MS = 250;
const MS_PER_SECOND = 1000;
const SHOW_FINAL_MS = 5000;
const FALLBACK_TAB = '/m/musicas';

export function returnPathOf(state: unknown): string {
  const from = (state as { from?: string } | null)?.from;
  return from && from !== '/m/votar' ? from : FALLBACK_TAB;
}

function secondsLeft(endsAt: string): number {
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / MS_PER_SECOND));
}

function Countdown({ endsAt }: { endsAt: string }) {
  const [remaining, setRemaining] = useState(() => secondsLeft(endsAt));
  useEffect(() => {
    const timer = setInterval(() => setRemaining(secondsLeft(endsAt)), TICK_MS);
    return () => clearInterval(timer);
  }, [endsAt]);
  return (
    <p role="timer" aria-label="Tempo para votar" className="text-lg text-muted">
      {remaining > 0 ? `${remaining} s para votar` : 'Encerrando…'}
    </p>
  );
}

function StarPicker({ voting, onVoted }: { voting: VotingSummary; onVoted: () => void }) {
  const profileId = useMobileProfileStore((state) => state.profile?.id);
  const castVote = useCastVoteMutation();
  const [chosen, setChosen] = useState(0);

  function vote(stars: number) {
    setChosen(stars);
    castVote.mutate(
      {
        performanceId: voting.performanceId,
        voterToken: voterToken(),
        stars,
        ...(profileId ? { voterProfileId: profileId } : {}),
      },
      {
        onSuccess: onVoted,
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'ALREADY_VOTED') {
            onVoted();
            return;
          }
          setChosen(0);
          toast.error(error instanceof Error ? error.message : 'Não foi possível votar');
        },
      },
    );
  }

  return (
    <div role="radiogroup" aria-label="Sua nota" className="flex justify-center gap-1">
      {Array.from({ length: STARS }, (_, index) => {
        const stars = index + 1;
        return (
          <button
            key={stars}
            type="button"
            role="radio"
            aria-checked={chosen === stars}
            aria-label={`${stars} ${stars === 1 ? 'estrela' : 'estrelas'}`}
            disabled={castVote.isPending}
            onClick={() => vote(stars)}
            className="inline-flex size-16 items-center justify-center rounded-full active:scale-90"
          >
            <Star
              aria-hidden="true"
              className={clsx('size-14', stars <= chosen ? 'fill-yellow-400 text-yellow-400' : 'text-muted')}
            />
          </button>
        );
      })}
    </div>
  );
}

export function MobileVotePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const profileId = useMobileProfileStore((state) => state.profile?.id);
  const voting = useCurrentVotingQuery();
  const final = useFinalScoreQuery();
  const [votedFor, setVotedFor] = useState<string | null>(null);
  const [shownVoting, setShownVoting] = useState<VotingSummary | null>(null);

  useEffect(() => {
    if (voting.data) setShownVoting(voting.data);
  }, [voting.data]);

  const finalScore =
    final.data && final.data.performanceId === shownVoting?.performanceId ? final.data : null;

  useEffect(() => {
    if (!finalScore) return;
    const timer = setTimeout(() => navigate(returnPathOf(location.state), { replace: true }), SHOW_FINAL_MS);
    return () => clearTimeout(timer);
  }, [finalScore, navigate, location.state]);

  if (voting.isLoading) return <Spinner className="mx-auto mt-10 size-8" />;

  if (!shownVoting) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl bg-surface p-4">
        <h1 className="font-display text-3xl">Votar</h1>
        <p className="text-base">
          Nenhuma votação agora. Quando alguém terminar de cantar, ela abre sozinha.
        </p>
        <Link to={FALLBACK_TAB} className="min-h-11 content-center text-base text-primary underline">
          Voltar para as músicas
        </Link>
      </div>
    );
  }

  const isSinger = shownVoting.singer.id === profileId;
  const hasVoted = votedFor === shownVoting.performanceId;

  return (
    <div className="flex flex-col items-center gap-5 pt-4 text-center">
      <Avatar avatarId={shownVoting.singer.avatar} size="lg" />
      <div>
        <h1 className="font-display text-3xl leading-tight">{shownVoting.singer.name}</h1>
        <p className="text-base text-muted">
          {shownVoting.song.title} — {shownVoting.song.artist}
        </p>
      </div>

      {finalScore ? (
        <div className="flex flex-col items-center gap-1" role="status">
          <p className="text-lg text-muted">Nota final</p>
          <p className="font-display text-7xl">{finalScore.finalScore ?? '—'}</p>
          <p className="text-base text-muted">
            {finalScore.votes} {finalScore.votes === 1 ? 'voto' : 'votos'}
          </p>
        </div>
      ) : isSinger ? (
        <p className="text-2xl font-semibold">É a sua vez! A plateia está votando 🎤</p>
      ) : hasVoted ? (
        <p className="text-2xl font-semibold">Obrigado! 🎉</p>
      ) : (
        <>
          <p className="text-xl font-semibold">Que nota você dá?</p>
          <StarPicker voting={shownVoting} onVoted={() => setVotedFor(shownVoting.performanceId)} />
        </>
      )}

      {!finalScore && <Countdown endsAt={shownVoting.endsAt} />}
    </div>
  );
}
