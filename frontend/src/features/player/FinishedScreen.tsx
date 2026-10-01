import { Button } from '../../components/Button';

interface FinishedScreenProps {
  songTitle: string;
  onSingAgain: () => void;
  onBack: () => void;
}

export function FinishedScreen({ songTitle, onSingAgain, onBack }: FinishedScreenProps) {
  return (
    <div className="flex flex-col items-center gap-8 px-4 text-center">
      <div>
        <p className="text-xl text-muted">Fim da música</p>
        <h1 className="font-display text-5xl leading-tight sm:text-7xl">{songTitle}</h1>
      </div>
      <p className="text-2xl">Mandou bem! 🎤</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button size="lg" onClick={onSingAgain} autoFocus>
          Cantar de novo
        </Button>
        <Button size="lg" variant="secondary" onClick={onBack}>
          Voltar
        </Button>
      </div>
    </div>
  );
}
