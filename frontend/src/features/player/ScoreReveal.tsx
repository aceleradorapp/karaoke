import type { FinalScore } from '@caraoke/shared';
import { Star } from 'lucide-react';
import { useEffect, useState } from 'react';

const COUNT_UP_MS = 1500;
const CONFETTI_FROM = 85;
const CONFETTI_PIECES = 40;
const STARS = 5;

export function scorePhrase(score: number): string {
  if (score >= 95) return 'Lenda do karaokê!';
  if (score >= 85) return 'Arrasou!';
  if (score >= 70) return 'Mandou bem!';
  if (score >= 50) return 'Tá no caminho!';
  return 'O importante é se divertir!';
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

function useCountUp(target: number): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    const startedAt = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const progress = Math.min(1, (now - startedAt) / COUNT_UP_MS);
      setValue(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return value;
}

function Confetti() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      {Array.from({ length: CONFETTI_PIECES }, (_, index) => (
        <span
          key={index}
          className="confetti-piece"
          style={{
            left: `${(index * 37) % 100}%`,
            animationDelay: `${(index % 10) * 0.12}s`,
            backgroundColor: ['#facc15', '#f472b6', '#38bdf8', '#4ade80', '#fb923c'][index % 5],
          }}
        />
      ))}
    </div>
  );
}

export function ScoreReveal({ result }: { result: FinalScore & { finalScore: number } }) {
  const shown = useCountUp(result.finalScore);
  const stars = Math.round((result.finalScore / 100) * STARS);

  return (
    <div className="flex flex-col items-center gap-4">
      {result.finalScore >= CONFETTI_FROM && <Confetti />}
      <p className="text-xl text-white/70">Nota</p>
      <p
        role="status"
        aria-label={`Nota ${result.finalScore}`}
        className="font-display text-9xl leading-none tabular-nums"
      >
        {shown}
      </p>
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: STARS }, (_, index) => (
          <Star
            key={index}
            className={index < stars ? 'size-9 fill-yellow-400 text-yellow-400' : 'size-9 text-white/30'}
          />
        ))}
      </div>
      <p className="text-3xl font-semibold">{scorePhrase(result.finalScore)}</p>
      <p className="text-lg text-white/70">
        {[
          result.pitchScore != null ? `🎯 Afinação ${result.pitchScore}` : null,
          result.audienceScore != null
            ? `👏 Plateia ${result.audienceScore} (${result.votes} ${result.votes === 1 ? 'voto' : 'votos'})`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </div>
  );
}
