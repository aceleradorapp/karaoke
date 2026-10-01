import { Minus, Plus, RotateCcw } from 'lucide-react';
import { formatOffsetSeconds } from '../../lib/format';

const STEPS: Array<{ label: string; ms: number }> = [
  { label: '5 s', ms: 5000 },
  { label: '1 s', ms: 1000 },
  { label: '0,1 s', ms: 100 },
  { label: '0,01 s', ms: 10 },
];

const STEP_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-1 rounded-lg bg-surface-2 px-3 text-base font-semibold hover:bg-surface-2/70';

interface OffsetControlsProps {
  offsetMs: number;
  initialOffsetMs: number;
  onNudge: (deltaMs: number) => void;
  onReset: (offsetMs: number) => void;
}

export function OffsetControls({ offsetMs, initialOffsetMs, onNudge, onReset }: OffsetControlsProps) {
  const isCleared = offsetMs === 0;
  const hasChangedSinceOpening = offsetMs !== initialOffsetMs;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span aria-label="Ajuste atual da letra" className="font-display text-5xl tabular-nums">
          {formatOffsetSeconds(offsetMs)}
        </span>
        <span className="text-base text-muted">
          {isCleared
            ? 'A letra está como veio, sem ajuste.'
            : offsetMs > 0
              ? 'A letra aparece mais tarde que o original.'
              : 'A letra aparece mais cedo que o original.'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STEPS.map((step) => (
          <button
            key={`later-${step.ms}`}
            type="button"
            onClick={() => onNudge(step.ms)}
            aria-label={`Atrasar a letra ${step.label}`}
            className={STEP_BUTTON}
          >
            <Plus aria-hidden="true" className="size-4" />
            {step.label}
          </button>
        ))}
        {STEPS.map((step) => (
          <button
            key={`earlier-${step.ms}`}
            type="button"
            onClick={() => onNudge(-step.ms)}
            aria-label={`Adiantar a letra ${step.label}`}
            className={STEP_BUTTON}
          >
            <Minus aria-hidden="true" className="size-4" />
            {step.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onReset(0)}
          disabled={isCleared}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-base text-muted hover:text-text disabled:opacity-40"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          Tirar o ajuste
        </button>
        <button
          type="button"
          onClick={() => onReset(initialOffsetMs)}
          disabled={!hasChangedSinceOpening}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-base text-muted hover:text-text disabled:opacity-40"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          Voltar ao de quando abri
        </button>
      </div>
    </div>
  );
}
