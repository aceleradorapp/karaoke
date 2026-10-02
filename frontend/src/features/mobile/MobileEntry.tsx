import { Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { ApiError, apiGet } from '../../api/client';
import { Spinner } from '../../components/Spinner';
import { reconnectSocket } from '../../realtime/socket';
import { useMobileAccessStore } from '../../stores/useMobileAccessStore';

export const MOBILE_HOME = '/m/musicas';

type CheckState = 'checking' | 'ok' | 'invalid' | 'missing' | 'offline';

export function ScanAgain({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6 text-center text-text">
      <Smartphone aria-hidden="true" className="size-14 text-primary" />
      <h1 className="font-display text-3xl">{title}</h1>
      <p className="max-w-sm text-base text-muted">{text}</p>
    </div>
  );
}

export function MobileEntry() {
  const [searchParams] = useSearchParams();
  const fromQr = searchParams.get('c');
  const savedCode = useMobileAccessStore((state) => state.code);
  const setCode = useMobileAccessStore((state) => state.setCode);
  const markOk = useMobileAccessStore((state) => state.markOk);
  const markDenied = useMobileAccessStore((state) => state.markDenied);
  const [state, setState] = useState<CheckState>('checking');

  useEffect(() => {
    if (fromQr) setCode(fromQr);
    const code = fromQr ?? savedCode;
    if (!code) {
      setState('missing');
      return;
    }

    let isCurrent = true;
    apiGet<{ ok: true }>('/system/access/check')
      .then(() => {
        if (!isCurrent) return;
        markOk();
        reconnectSocket();
        setState('ok');
      })
      .catch((error: unknown) => {
        if (!isCurrent) return;
        const isDenied = error instanceof ApiError && error.status === 401;
        if (isDenied) markDenied();
        setState(isDenied ? 'invalid' : 'offline');
      });
    return () => {
      isCurrent = false;
    };
  }, [fromQr]);

  if (state === 'ok') return <Navigate to={MOBILE_HOME} replace />;
  if (state === 'missing') {
    return (
      <ScanAgain
        title="Escaneie o QR code"
        text="Na TV, toque no botão do celular e aponte a câmera para o QR code."
      />
    );
  }
  if (state === 'invalid') {
    return <ScanAgain title="Código inválido" text="Escaneie o QR code na TV de novo." />;
  }
  if (state === 'offline') {
    return (
      <ScanAgain
        title="Não foi possível conectar"
        text="Confira se o celular está no mesmo Wi-Fi que o PC do karaokê e tente abrir o QR code de novo."
      />
    );
  }
  return (
    <div className="flex min-h-dvh items-center justify-center gap-3 bg-bg text-text">
      <Spinner className="size-8" />
      <span>Conectando ao karaokê…</span>
    </div>
  );
}
