import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';

const TICK_MS = 1000;

interface NextSingerCountdownProps {
  seconds: number;
  onGo: () => void;
}

export function NextSingerCountdown({ seconds, onGo }: NextSingerCountdownProps) {
  const [remaining, setRemaining] = useState(seconds);
  const [isWaiting, setIsWaiting] = useState(false);

  useEffect(() => {
    if (isWaiting) return;
    if (remaining <= 0) {
      onGo();
      return;
    }
    const timer = setTimeout(() => setRemaining((current) => current - 1), TICK_MS);
    return () => clearTimeout(timer);
  }, [remaining, isWaiting, onGo]);

  if (isWaiting) {
    return (
      <Button size="lg" onClick={onGo} autoFocus>
        Chamar o próximo
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <p role="timer" aria-label="Chamando o próximo" className="text-lg">
        Chamando em <strong className="tabular-nums">{remaining}</strong> s
      </p>
      <Button size="lg" onClick={onGo} autoFocus>
        Ir agora
      </Button>
      <Button size="lg" variant="secondary" onClick={() => setIsWaiting(true)}>
        Esperar
      </Button>
    </div>
  );
}
