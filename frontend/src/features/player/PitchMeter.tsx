import clsx from 'clsx';
import { semitoneDistance } from '../../lib/pitch/PitchScorer';
import { noteName } from '../../lib/pitch/notes';
import type { PitchReading } from './usePitchScoring';

const IN_TUNE_SEMITONES = 0.5;
const CLOSE_SEMITONES = 2;

export function PitchMeter({ reading }: { reading: PitchReading }) {
  const { target, sung, liveScore } = reading;
  const distance = target != null && sung != null ? semitoneDistance(sung, target) : null;
  const tone =
    distance == null
      ? 'idle'
      : distance <= IN_TUNE_SEMITONES
        ? 'good'
        : distance <= CLOSE_SEMITONES
          ? 'close'
          : 'off';

  return (
    <div
      role="group"
      aria-label="Afinação ao vivo"
      className="flex items-center gap-3 rounded-full bg-black/50 px-4 py-2 text-base backdrop-blur"
    >
      <span className="text-white/70">Nota alvo</span>
      <span className="w-10 font-semibold">{target != null ? noteName(target) : '—'}</span>
      <span
        className={clsx(
          'w-12 rounded-full px-2 text-center font-semibold',
          tone === 'good' && 'bg-emerald-400 text-black',
          tone === 'close' && 'bg-amber-400 text-black',
          tone === 'off' && 'bg-red-500 text-white',
          tone === 'idle' && 'bg-white/15 text-white/70',
        )}
      >
        {sung != null ? noteName(sung) : '…'}
      </span>
      <span className="ml-2 tabular-nums" aria-live="off">
        Nota: <strong>{liveScore}</strong>
      </span>
    </div>
  );
}
