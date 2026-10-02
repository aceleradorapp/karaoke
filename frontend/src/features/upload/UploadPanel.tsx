import { SUPPORTED_AUDIO_EXTENSIONS } from '@caraoke/shared';
import clsx from 'clsx';
import { AlertCircle, Check, FileAudio, UploadCloud } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Button } from '../../components/Button';
import { useActingProfileId } from '../../lib/actingProfile';
import { useUploadQueue, type UploadItem } from './useUploadQueue';

const ACCEPTED_EXTENSIONS = SUPPORTED_AUDIO_EXTENSIONS.join(',');
const PERCENT = 100;

function ItemStatus({ item, onRetry }: { item: UploadItem; onRetry: () => void }) {
  if (item.status === 'waiting') return <span className="text-sm text-muted">Aguardando</span>;
  if (item.status === 'uploading') {
    return <span className="text-sm text-muted">{Math.round(item.progress * PERCENT)}%</span>;
  }
  if (item.status === 'done') {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-accent">
        <Check aria-hidden="true" className="size-4" />
        Enviado · na fila de processamento
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm text-danger">
      <AlertCircle aria-hidden="true" className="size-4" />
      {item.error}
      {item.isRetryable && (
        <button type="button" onClick={onRetry} className="min-h-8 underline">
          Tentar de novo
        </button>
      )}
    </span>
  );
}

function UploadRow({ item, onRetry }: { item: UploadItem; onRetry: () => void }) {
  const percent = Math.round(item.progress * PERCENT);
  return (
    <li className="flex flex-col gap-2 rounded-xl bg-surface p-3">
      <div className="flex items-center gap-3">
        <FileAudio aria-hidden="true" className="size-5 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate text-base">{item.file.name}</span>
      </div>
      {item.status === 'uploading' && (
        <div
          role="progressbar"
          aria-label={`Enviando ${item.file.name}`}
          aria-valuemin={0}
          aria-valuemax={PERCENT}
          aria-valuenow={percent}
          className="h-2 overflow-hidden rounded-full bg-surface-2"
        >
          <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      )}
      <ItemStatus item={item} onRetry={onRetry} />
    </li>
  );
}

interface UploadPanelProps {
  isCompact?: boolean;
}

export function UploadPanel({ isCompact = false }: UploadPanelProps) {
  const profileId = useActingProfileId();
  const { items, addFiles, retry, clearFinished } = useUploadQueue(profileId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  function handleChoose(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  }

  const hasFinished = items.some((item) => item.status === 'done' || item.status === 'error');

  return (
    <div className="flex flex-col gap-6">
      <div
        data-testid="dropzone"
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={clsx(
          'flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed p-8 text-center transition',
          isDragging ? 'border-primary bg-surface-2' : 'border-muted bg-surface',
        )}
      >
        <UploadCloud aria-hidden="true" className="size-12 text-muted" />
        <p className="text-lg">
          {isCompact ? 'Escolha músicas guardadas no celular' : 'Arraste os arquivos de áudio até aqui'}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleChoose}
          aria-label="Escolher arquivos de áudio"
          className="sr-only"
        />
        <Button onClick={() => inputRef.current?.click()}>Escolher arquivos</Button>
        <p className="text-sm text-muted">
          Formatos aceitos: {SUPPORTED_AUDIO_EXTENSIONS.join(' ')} · até 60 MB cada
        </p>
      </div>

      {!isCompact && (
        <p className="text-sm text-muted">
          Você também pode copiar os arquivos direto para a pasta <code>storage/entrada/upload</code> no PC:
          eles entram na fila sozinhos.
        </p>
      )}

      {items.length > 0 && (
        <section aria-label="Arquivos enviados" className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <UploadRow key={item.id} item={item} onRetry={() => retry(item.id)} />
            ))}
          </ul>
          {hasFinished && (
            <Button variant="ghost" onClick={clearFinished} className="self-start">
              Limpar concluídos
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
