import type { LyricLine } from '@caraoke/shared';
import { Target, Undo2 } from 'lucide-react';
import { Button } from '../../components/Button';

interface TapSyncPanelProps {
  lines: readonly LyricLine[];
  targetIndex: number;
  onMark: () => void;
  onBack: () => void;
  onStop: () => void;
}

export function TapSyncPanel({ lines, targetIndex, onMark, onBack, onStop }: TapSyncPanelProps) {
  const target = lines[targetIndex];
  const next = lines[targetIndex + 1];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-muted">
        Toque a música e aperte <strong className="text-text">Marcar</strong> (ou Enter) no instante em que a
        linha abaixo começar a ser cantada. A próxima linha já fica pronta. O botão desconta o tempo de
        reação.
      </p>

      <div className="rounded-xl bg-black px-4 py-6 text-center text-white">
        <p className="text-sm text-white/60">
          Linha {targetIndex + 1} de {lines.length}
        </p>
        <p className="font-display text-3xl leading-tight sm:text-4xl">{target?.text ?? 'Fim da letra'}</p>
        {next && <p className="mt-2 text-base text-white/50">Depois: {next.text}</p>}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button size="lg" onClick={onMark} disabled={!target}>
          <Target aria-hidden="true" className="size-5" />
          Marcar
        </Button>
        <Button size="lg" variant="secondary" onClick={onBack} disabled={targetIndex === 0}>
          <Undo2 aria-hidden="true" className="size-5" />
          Voltar uma linha
        </Button>
        <Button size="lg" variant="ghost" onClick={onStop}>
          Parar de marcar
        </Button>
      </div>
    </div>
  );
}
