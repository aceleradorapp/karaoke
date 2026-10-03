import type { FinalScore } from '@caraoke/shared';
import { Button } from '../../components/Button';
import { NextSingerCountdown } from './NextSingerCountdown';
import { ScoreReveal } from './ScoreReveal';

export interface PlaylistSequence {
  position: number;
  total: number;
  nextTitle: string | null;
  onNext: () => void;
}

export interface NextSinger {
  singerName: string;
  songTitle: string;
  onCall: () => void;
}

interface FinishedScreenProps {
  songTitle: string;
  onSingAgain: () => void;
  onBack: () => void;
  sequence?: PlaylistSequence | null;
  nextSinger?: NextSinger | null;
  score?: FinalScore | null;
  autoAdvanceSeconds?: number;
}

export function FinishedScreen({
  songTitle,
  onSingAgain,
  onBack,
  sequence,
  nextSinger,
  score,
  autoAdvanceSeconds = 0,
}: FinishedScreenProps) {
  const hasNext = sequence?.nextTitle != null;
  const hasPrimaryAction = hasNext || Boolean(nextSinger);
  const finalScore = score?.finalScore ?? null;

  return (
    <div className="flex flex-col items-center gap-8 px-4 text-center">
      <div>
        <p className="text-xl text-muted">
          {sequence ? `Música ${sequence.position} de ${sequence.total} da playlist` : 'Fim da música'}
        </p>
        <h1 className="font-display text-5xl leading-tight sm:text-7xl">{songTitle}</h1>
      </div>
      {score && finalScore != null ? (
        <ScoreReveal result={{ ...score, finalScore }} />
      ) : (
        <p className="text-2xl">{sequence && !hasNext ? 'Fim da playlist! 🎉' : 'Mandou bem! 🎤'}</p>
      )}
      {hasNext && <p className="text-lg text-muted">A seguir: {sequence?.nextTitle}</p>}
      {nextSinger && (
        <p className="text-lg text-muted">
          A seguir: {nextSinger.singerName} — {nextSinger.songTitle}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        {hasNext && (
          <Button size="lg" onClick={sequence?.onNext} autoFocus>
            Próxima música
          </Button>
        )}
        {nextSinger &&
          (autoAdvanceSeconds > 0 ? (
            <NextSingerCountdown seconds={autoAdvanceSeconds} onGo={nextSinger.onCall} />
          ) : (
            <Button size="lg" onClick={nextSinger.onCall} autoFocus>
              Chamar o próximo
            </Button>
          ))}
        <Button
          size="lg"
          variant={hasPrimaryAction ? 'secondary' : 'primary'}
          onClick={onSingAgain}
          autoFocus={!hasPrimaryAction}
        >
          Cantar de novo
        </Button>
        <Button size="lg" variant="secondary" onClick={onBack}>
          Voltar
        </Button>
      </div>
    </div>
  );
}
