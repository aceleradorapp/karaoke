import { WORKER_NAME_MAX_LENGTH, type PairingCodeDTO, type ProcessingWorkerDTO } from '@caraoke/shared';
import clsx from 'clsx';
import { Cpu, Download, Link2, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  useCancelPairingMutation,
  useRemoveWorkerMutation,
  useRenameWorkerMutation,
  useStartPairingMutation,
  useWorkersQuery,
} from '../../api/workers';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { SaveIndicator } from '../../components/SaveIndicator';
import { formatTimeAgo as formatSeen } from '../../lib/format';
import { useAutoSave } from '../../lib/useAutoSave';
import { toast } from '../../stores/useToastStore';
import { SettingsSection } from './fields';

const SECOND_MS = 1000;

function deviceText(worker: ProcessingWorkerDTO): string {
  if (!worker.online) return worker.lastSeenAt ? `Desligada · vista ${formatSeen(worker.lastSeenAt)}` : 'Desligada';
  if (worker.gpuName && worker.device !== 'cpu') return `Ligada · placa ${worker.gpuName}`;
  return 'Ligada · processador (CPU)';
}

function WorkerName({ worker }: { worker: ProcessingWorkerDTO }) {
  const [name, setName] = useState(worker.name);
  const rename = useRenameWorkerMutation(worker.id);
  const autoSave = useAutoSave(name, (value) => rename.mutateAsync(value.trim()), {
    isValid: (value) => value.trim().length > 0 && value.trim() !== worker.name,
  });

  if (worker.isLocal) return <p className="truncate text-base font-semibold">{worker.name}</p>;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        value={name}
        maxLength={WORKER_NAME_MAX_LENGTH}
        onChange={(event) => setName(event.target.value)}
        aria-label={`Nome da máquina ${worker.name}`}
        className="min-h-11 min-w-0 flex-1 rounded-lg bg-surface-2 px-3 text-base font-semibold"
      />
      <SaveIndicator status={autoSave.status} onRetry={autoSave.retry} />
    </div>
  );
}

function PairingPanel({ pairing, onClose }: { pairing: PairingCodeDTO; onClose: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const serverUrl = pairing.serverUrls[0] ?? 'http://<ip-do-pc-do-karaoke>:3333';
  const secondsLeft = Math.max(0, Math.round((Date.parse(pairing.expiresAt) - now) / SECOND_MS));

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), SECOND_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div role="region" aria-label="Parear uma máquina" className="flex flex-col gap-4 rounded-xl border border-accent/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Código de pareamento</p>
          <p className="font-display text-5xl tracking-[0.2em] tabular-nums" aria-label="Código de pareamento">
            {secondsLeft > 0 ? pairing.code : '——————'}
          </p>
          <p className="text-sm text-muted">
            {secondsLeft > 0
              ? `Vale por mais ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`
              : 'Código vencido: gere outro'}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar o pareamento">
          <X aria-hidden="true" className="size-5" />
        </Button>
      </div>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
        <li>
          Na outra máquina (Windows com placa NVIDIA), abra no navegador{' '}
          <a className="break-all text-primary underline" href={`${serverUrl}${pairing.downloadPath}`}>
            {serverUrl}
            {pairing.downloadPath}
          </a>{' '}
          para baixar o processador.
        </li>
        <li>Descompacte o ZIP e rode o “Instalar.cmd” (a primeira vez baixa uns 3 GB).</li>
        <li>
          Abra o atalho “Processador do Karaokê” e informe o endereço{' '}
          <code className="rounded bg-bg px-1">{serverUrl}</code> e o código acima.
        </li>
      </ol>
      <a
        href={pairing.downloadPath}
        download
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg bg-surface-2 px-4 text-sm font-semibold"
      >
        <Download aria-hidden="true" className="size-5" />
        Baixar o processador aqui
      </a>
    </div>
  );
}

export function WorkersSection() {
  const workers = useWorkersQuery();
  const startPairing = useStartPairingMutation();
  const cancelPairing = useCancelPairingMutation();
  const removeWorker = useRemoveWorkerMutation();
  const [pairing, setPairing] = useState<PairingCodeDTO | null>(null);
  const [removing, setRemoving] = useState<ProcessingWorkerDTO | null>(null);
  const pairedCount = useRef<number | null>(null);

  const remoteCount = workers.data?.filter((worker) => !worker.isLocal).length ?? null;

  useEffect(() => {
    if (remoteCount === null) return;
    const previous = pairedCount.current;
    pairedCount.current = remoteCount;
    if (pairing && previous !== null && remoteCount > previous) {
      setPairing(null);
      toast.success('Máquina pareada! Ela já pode processar músicas.');
    }
  }, [remoteCount, pairing]);

  function openPairing() {
    startPairing.mutate(undefined, {
      onSuccess: setPairing,
      onError: () => toast.error('Não foi possível gerar o código'),
    });
  }

  function closePairing() {
    setPairing(null);
    cancelPairing.mutate();
  }

  return (
    <SettingsSection title="Máquinas de processamento">
      <p className="text-base text-muted">
        Outra máquina da casa, de preferência com placa de vídeo NVIDIA, pode separar a voz e preparar as músicas bem
        mais rápido.
      </p>

      <ul className="flex flex-col gap-2">
        {workers.data?.map((worker) => (
          <li key={worker.id} className="flex flex-col gap-2 rounded-xl bg-surface-2/60 p-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span
                aria-hidden="true"
                className={clsx('size-3 shrink-0 rounded-full', worker.online ? 'bg-accent' : 'bg-muted/50')}
              />
              <Cpu aria-hidden="true" className="size-5 shrink-0 text-muted" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <WorkerName worker={worker} />
                <p className="truncate text-sm text-muted">
                  {deviceText(worker)}
                  {worker.currentSongTitle && ` · processando ${worker.currentSongTitle}`}
                </p>
              </div>
            </div>
            {!worker.isLocal && (
              <Button variant="ghost" onClick={() => setRemoving(worker)} aria-label={`Remover ${worker.name}`}>
                <Trash2 aria-hidden="true" className="size-5" />
                Remover
              </Button>
            )}
          </li>
        ))}
      </ul>

      {pairing ? (
        <PairingPanel pairing={pairing} onClose={closePairing} />
      ) : (
        <Button variant="secondary" className="self-start" onClick={openPairing} disabled={startPairing.isPending}>
          <Link2 aria-hidden="true" className="size-5" />
          Parear uma máquina
        </Button>
      )}

      <ConfirmDialog
        isOpen={removing !== null}
        title="Remover máquina"
        message={`Remover “${removing?.name ?? ''}”? Ela deixa de processar músicas; a que estiver no meio volta para a fila.`}
        confirmLabel="Remover"
        dismissLabel="Voltar"
        onConfirm={() => {
          if (removing) {
            removeWorker.mutate(removing.id, { onError: () => toast.error('Não foi possível remover a máquina') });
          }
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </SettingsSection>
  );
}
