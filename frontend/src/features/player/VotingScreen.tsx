import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { useAccessQuery } from '../../api/system';
import { Button } from '../../components/Button';

const TICK_MS = 250;
const MS_PER_SECOND = 1000;
const QR_SIZE = 140;

interface VotingScreenProps {
  singerName: string;
  songTitle: string;
  endsAt: string;
  votes: number;
  isClosing: boolean;
  onCloseNow: () => void;
  onTimeUp: () => void;
}

const GRACE_AFTER_END_MS = 5000;

function secondsLeft(endsAt: string): number {
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / MS_PER_SECOND));
}

export function VotingScreen({
  singerName,
  songTitle,
  endsAt,
  votes,
  isClosing,
  onCloseNow,
  onTimeUp,
}: VotingScreenProps) {
  const [remaining, setRemaining] = useState(() => secondsLeft(endsAt));
  const access = useAccessQuery(true);
  const phoneUrl = access.data?.urls[0];

  useEffect(() => {
    const timer = setInterval(() => setRemaining(secondsLeft(endsAt)), TICK_MS);
    const giveUp = setTimeout(onTimeUp, new Date(endsAt).getTime() - Date.now() + GRACE_AFTER_END_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(giveUp);
    };
  }, [endsAt, onTimeUp]);

  return (
    <div className="flex w-full max-w-4xl flex-col items-center gap-8 px-4 text-center">
      <div>
        <p className="text-xl text-white/70">
          {singerName} cantou {songTitle}
        </p>
        <h1 className="font-display text-4xl leading-tight sm:text-6xl">
          Plateia, deem sua nota pelo celular!
        </h1>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-10">
        <div role="timer" aria-label="Tempo para votar" className="flex flex-col items-center">
          <span className="font-display text-8xl tabular-nums sm:text-9xl">{remaining}</span>
          <span className="text-lg text-white/70">segundos</span>
        </div>
        <div className="flex flex-col items-center" aria-live="polite">
          <span className="font-display text-8xl tabular-nums sm:text-9xl">{votes}</span>
          <span className="text-lg text-white/70">{votes === 1 ? 'voto' : 'votos'}</span>
        </div>
        {phoneUrl && (
          <div className="flex flex-col items-center gap-2 max-sm:hidden">
            <div className="rounded-xl bg-white p-2">
              <QRCodeSVG value={phoneUrl} size={QR_SIZE} level="M" title="QR code para votar pelo celular" />
            </div>
            <span className="text-sm text-white/70">Ainda não entrou? Escaneie</span>
          </div>
        )}
      </div>

      <Button variant="secondary" size="lg" onClick={onCloseNow} isLoading={isClosing}>
        Encerrar votação
      </Button>
    </div>
  );
}
