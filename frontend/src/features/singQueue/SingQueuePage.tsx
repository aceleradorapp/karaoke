import type { SingRequestDTO } from '@caraoke/shared';
import { ArrowDown, ArrowUp, Play, Smartphone, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  firstReadyRequest,
  singRequestRoute,
  useRemoveSingRequestMutation,
  useReorderSingQueueMutation,
  useSingQueueQuery,
} from '../../api/singQueue';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { moveItem } from '../../lib/reorder';
import { toast } from '../../stores/useToastStore';
import { AccessQrModal } from '../mobile/AccessQrModal';

const ICON_BUTTON_CLASSES =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-surface-2 disabled:opacity-30';

interface RequestRowProps {
  request: SingRequestDTO;
  index: number;
  total: number;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
  onCall: () => void;
}

function RequestRow({ request, index, total, onMove, onRemove, onCall }: RequestRowProps) {
  const isReady = request.song.status === 'READY';
  const label = `${request.profile.name}, ${request.song.title}`;

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-3 sm:flex-nowrap sm:p-4">
      <span className="w-8 shrink-0 text-center text-2xl font-semibold text-muted">{index + 1}</span>
      <Avatar avatarId={request.profile.avatar} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold">{request.profile.name}</p>
        <p className="truncate text-base text-muted">
          {request.song.title} — {request.song.artist}
        </p>
        {!isReady && <p className="text-sm text-primary">preparando…</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1 max-sm:ml-auto">
        <button
          type="button"
          aria-label={`Chamar ${label}`}
          title={isReady ? 'Chamar agora' : 'A música ainda está sendo preparada'}
          onClick={onCall}
          disabled={!isReady}
          className={ICON_BUTTON_CLASSES}
        >
          <Play aria-hidden="true" className="size-5" />
        </button>
        <button
          type="button"
          aria-label={`Subir ${label}`}
          onClick={() => onMove(index, index - 1)}
          disabled={index === 0}
          className={ICON_BUTTON_CLASSES}
        >
          <ArrowUp aria-hidden="true" className="size-5" />
        </button>
        <button
          type="button"
          aria-label={`Descer ${label}`}
          onClick={() => onMove(index, index + 1)}
          disabled={index === total - 1}
          className={ICON_BUTTON_CLASSES}
        >
          <ArrowDown aria-hidden="true" className="size-5" />
        </button>
        <button
          type="button"
          aria-label={`Tirar ${label} da fila`}
          onClick={onRemove}
          className={ICON_BUTTON_CLASSES}
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
    </li>
  );
}

export function SingQueuePage() {
  const navigate = useNavigate();
  const queue = useSingQueueQuery();
  const reorder = useReorderSingQueueMutation();
  const removeRequest = useRemoveSingRequestMutation();
  const [isAccessOpen, setIsAccessOpen] = useState(false);
  const requests = queue.data ?? [];
  const next = firstReadyRequest(requests);

  function move(from: number, to: number) {
    reorder.mutate(
      moveItem(requests, from, to).map((request) => request.id),
      {
        onError: () => toast.error('Não foi possível mudar a ordem'),
      },
    );
  }

  function remove(request: SingRequestDTO) {
    removeRequest.mutate(
      { id: request.id },
      { onError: () => toast.error('Não foi possível tirar da fila') },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl">Próximos a cantar</h1>
        <Button size="lg" onClick={() => next && navigate(singRequestRoute(next))} disabled={!next}>
          <Play aria-hidden="true" className="size-5" />
          Chamar o próximo
        </Button>
      </div>

      {queue.isLoading && <Spinner className="mx-auto size-10" />}
      {queue.isError && (
        <p role="alert" className="text-danger">
          Não foi possível carregar a fila de cantores.
        </p>
      )}

      {queue.isSuccess && requests.length === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-2xl bg-surface p-6">
          <p className="text-xl">Ninguém na fila.</p>
          <p className="text-base text-muted">
            Cada convidado escolhe pelo celular o que quer cantar: é só escanear o QR code.
          </p>
          <Button variant="secondary" onClick={() => setIsAccessOpen(true)}>
            <Smartphone aria-hidden="true" className="size-5" />
            Mostrar o QR code
          </Button>
        </div>
      )}

      {requests.length > 0 && (
        <ol aria-label="Fila de cantores" className="flex flex-col gap-2">
          {requests.map((request, index) => (
            <RequestRow
              key={request.id}
              request={request}
              index={index}
              total={requests.length}
              onMove={move}
              onRemove={() => remove(request)}
              onCall={() => navigate(singRequestRoute(request))}
            />
          ))}
        </ol>
      )}

      <AccessQrModal isOpen={isAccessOpen} onClose={() => setIsAccessOpen(false)} />
    </div>
  );
}
