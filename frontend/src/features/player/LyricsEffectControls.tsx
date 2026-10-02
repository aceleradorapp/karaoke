import {
  FILL_PERCENT_DEFAULT,
  FILL_PERCENT_MAX,
  FILL_PERCENT_MIN,
  FILL_PERCENT_STEP,
  type LyricsEffectId,
} from '@caraoke/shared';
import clsx from 'clsx';
import { Highlighter, Minus, Plus, RotateCcw } from 'lucide-react';
import { LYRICS_EFFECTS, LYRICS_EFFECT_LIST } from '../../lib/lyrics/effects';

type Variant = 'player' | 'panel';

interface LyricsEffectControlsProps {
  enabled: boolean;
  effectId: LyricsEffectId;
  fillPercent: number;
  onEnabledChange: (enabled: boolean) => void;
  onEffectChange: (id: LyricsEffectId) => void;
  onFillPercentChange: (percent: number) => void;
  variant?: Variant;
  className?: string;
}

const SURFACES: Record<Variant, { button: string; field: string; muted: string }> = {
  player: {
    button: 'bg-white/15 hover:bg-white/25 text-white',
    field: 'bg-white/15 text-white',
    muted: 'text-white/70',
  },
  panel: {
    button: 'bg-surface-2 hover:bg-surface-2/70 text-text',
    field: 'bg-surface-2 text-text',
    muted: 'text-muted',
  },
};

interface LyricsEffectToggleProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  variant?: Variant;
}

export function LyricsEffectToggle({ enabled, onEnabledChange, variant = 'panel' }: LyricsEffectToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onEnabledChange(!enabled)}
      aria-pressed={enabled}
      title="Liga ou desliga o efeito que pinta a letra enquanto se canta (tecla E). Desligado, a linha inteira fica colorida assim que começa."
      className={clsx(
        'inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-base font-semibold transition',
        enabled ? 'bg-primary text-primary-contrast' : SURFACES[variant].button,
      )}
    >
      <Highlighter aria-hidden="true" className="size-5" />
      Efeito: {enabled ? 'ligado' : 'desligado'}
    </button>
  );
}

export function LyricsEffectControls({
  enabled,
  effectId,
  fillPercent,
  onEnabledChange,
  onEffectChange,
  onFillPercentChange,
  variant = 'panel',
  className,
}: LyricsEffectControlsProps) {
  const surface = SURFACES[variant];
  const roundButton = clsx(
    'inline-flex size-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40',
    surface.button,
  );

  return (
    <div className={clsx('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
      <LyricsEffectToggle enabled={enabled} onEnabledChange={onEnabledChange} variant={variant} />

      <label className="flex items-center gap-2 text-sm">
        <span className={surface.muted}>Modelo</span>
        <select
          value={effectId}
          onChange={(event) => onEffectChange(event.target.value as LyricsEffectId)}
          disabled={!enabled}
          aria-label="Modelo do efeito"
          title={LYRICS_EFFECTS[effectId].description}
          className={clsx('min-h-11 rounded-lg px-3 text-base disabled:opacity-40', surface.field)}
        >
          {LYRICS_EFFECT_LIST.map((effect) => (
            <option key={effect.id} value={effect.id} className="text-black">
              {effect.label}
            </option>
          ))}
        </select>
      </label>

      <div role="group" aria-label="Tempo de preenchimento" className="flex flex-wrap items-center gap-2">
        <span className={clsx('text-sm', surface.muted)}>Tempo</span>
        <button
          type="button"
          onClick={() => onFillPercentChange(fillPercent - FILL_PERCENT_STEP)}
          disabled={!enabled || fillPercent <= FILL_PERCENT_MIN}
          aria-label="Terminar de pintar mais cedo"
          title="Termina de pintar a linha mais cedo (o começo continua igual)"
          className={roundButton}
        >
          <Minus aria-hidden="true" className="size-5" />
        </button>
        <input
          type="range"
          min={FILL_PERCENT_MIN}
          max={FILL_PERCENT_MAX}
          step={FILL_PERCENT_STEP}
          value={fillPercent}
          onChange={(event) => onFillPercentChange(Number(event.target.value))}
          disabled={!enabled}
          aria-label="Tempo de preenchimento"
          aria-valuetext={`${fillPercent}%`}
          className="w-24 cursor-pointer accent-[var(--primary)] disabled:opacity-40 sm:w-32"
        />
        <button
          type="button"
          onClick={() => onFillPercentChange(fillPercent + FILL_PERCENT_STEP)}
          disabled={!enabled || fillPercent >= FILL_PERCENT_MAX}
          aria-label="Terminar de pintar mais tarde"
          title="Termina de pintar a linha mais tarde (o começo continua igual)"
          className={roundButton}
        >
          <Plus aria-hidden="true" className="size-5" />
        </button>
        <span aria-hidden="true" className="w-12 text-center text-base font-semibold tabular-nums">
          {fillPercent}%
        </span>
        <button
          type="button"
          onClick={() => onFillPercentChange(FILL_PERCENT_DEFAULT)}
          disabled={!enabled || fillPercent === FILL_PERCENT_DEFAULT}
          aria-label="Voltar o tempo para 100%"
          title="Voltar ao tempo normal (100%)"
          className={roundButton}
        >
          <RotateCcw aria-hidden="true" className="size-5" />
        </button>
      </div>
    </div>
  );
}
