import { Button } from '../../components/Button';

export interface PlaylistSequence {
  position: number;
  total: number;
  nextTitle: string | null;
  onNext: () => void;
}

interface FinishedScreenProps {
  songTitle: string;
  onSingAgain: () => void;
  onBack: () => void;
  sequence?: PlaylistSequence | null;
}

export function FinishedScreen({ songTitle, onSingAgain, onBack, sequence }: FinishedScreenProps) {
  const hasNext = sequence?.nextTitle != null;

  return (
    <div className="flex flex-col items-center gap-8 px-4 text-center">
      <div>
        <p className="text-xl text-muted">
          {sequence ? `Música ${sequence.position} de ${sequence.total} da playlist` : 'Fim da música'}
        </p>
        <h1 className="font-display text-5xl leading-tight sm:text-7xl">{songTitle}</h1>
      </div>
      <p className="text-2xl">{sequence && !hasNext ? 'Fim da playlist! 🎉' : 'Mandou bem! 🎤'}</p>
      {hasNext && <p className="text-lg text-muted">A seguir: {sequence?.nextTitle}</p>}
      <div className="flex flex-wrap justify-center gap-3">
        {hasNext && (
          <Button size="lg" onClick={sequence?.onNext} autoFocus>
            Próxima música
          </Button>
        )}
        <Button
          size="lg"
          variant={hasNext ? 'secondary' : 'primary'}
          onClick={onSingAgain}
          autoFocus={!hasNext}
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
