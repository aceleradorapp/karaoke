import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SingRequestDTO } from '@caraoke/shared';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, GripVertical, Play, Plus, Shuffle, Smartphone, Trophy, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useSettingsQuery, useUpdateSettingsMutation } from '../../api/settings';
import {
  nextRequestOf,
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
import { AddRequestModal } from './AddRequestModal';

const ICON_BUTTON_CLASSES =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-surface-2 disabled:opacity-30';
const TOUCH_HOLD_MS = 150;
const TOUCH_TOLERANCE_PX = 6;
const POINTER_DISTANCE_PX = 6;

interface RequestRowProps {
  request: SingRequestDTO;
  index: number;
  total: number;
  isNext: boolean;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
  onCall: () => void;
}

function RequestRow({ request, index, total, isNext, onMove, onRemove, onCall }: RequestRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: request.id });
  const isReady = request.song.status === 'READY';
  const label = `${request.profile.name}, ${request.song.title}`;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        'flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-3 sm:flex-nowrap sm:p-4',
        isNext && 'ring-2 ring-primary',
        isDragging && 'relative z-10 opacity-90 shadow-2xl',
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Arrastar ${label}`}
        className="inline-flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted hover:bg-surface-2 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" className="size-5" />
      </button>
      <span className="w-6 shrink-0 text-center text-2xl font-semibold text-muted">{index + 1}</span>
      <Avatar avatarId={request.profile.avatar} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-lg font-semibold">
          <span className="truncate">{request.profile.name}</span>
          {isNext && (
            <span className="shrink-0 rounded-full bg-primary px-2 text-xs text-primary-contrast">
              Próximo
            </span>
          )}
        </p>
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

function ShuffleToggle() {
  const settings = useSettingsQuery();
  const updateSettings = useUpdateSettingsMutation();
  const isOn = settings.data?.['queue.shuffle'] ?? false;

  return (
    <Button
      variant={isOn ? 'primary' : 'secondary'}
      aria-pressed={isOn}
      disabled={!settings.data}
      onClick={() =>
        updateSettings.mutate(
          { 'queue.shuffle': !isOn },
          { onError: () => toast.error('Não foi possível mudar o modo aleatório') },
        )
      }
      title="Ligado, o próximo cantor é sorteado entre as músicas prontas"
    >
      <Shuffle aria-hidden="true" className="size-5" />
      Aleatório
    </Button>
  );
}

export function SingQueuePage() {
  const navigate = useNavigate();
  const queue = useSingQueueQuery();
  const reorder = useReorderSingQueueMutation();
  const removeRequest = useRemoveSingRequestMutation();
  const [isAccessOpen, setIsAccessOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const requests = queue.data?.items ?? [];
  const next = nextRequestOf(queue.data);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: POINTER_DISTANCE_PX } }),
    useSensor(TouchSensor, { activationConstraint: { delay: TOUCH_HOLD_MS, tolerance: TOUCH_TOLERANCE_PX } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function saveOrder(ordered: SingRequestDTO[]) {
    reorder.mutate(
      ordered.map((request) => request.id),
      { onError: () => toast.error('Não foi possível mudar a ordem') },
    );
  }

  function move(from: number, to: number) {
    saveOrder(moveItem(requests, from, to));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = requests.findIndex((request) => request.id === active.id);
    const to = requests.findIndex((request) => request.id === over.id);
    if (from >= 0 && to >= 0) saveOrder(arrayMove(requests, from, to));
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
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setIsAdding(true)}>
            <Plus aria-hidden="true" className="size-5" />
            Adicionar
          </Button>
          <ShuffleToggle />
          <Button size="lg" onClick={() => next && navigate(singRequestRoute(next))} disabled={!next}>
            <Play aria-hidden="true" className="size-5" />
            Chamar o próximo
          </Button>
        </div>
      </div>

      {queue.data?.competition && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-4 ring-2 ring-primary">
          <Trophy aria-hidden="true" className="size-6 text-yellow-400" />
          <p className="min-w-0 flex-1 text-base">
            Disputa <strong>{queue.data.competition.name}</strong> em andamento: a fila mostra só as músicas
            dela. Os outros pedidos voltam quando ela terminar.
          </p>
          <Link
            to={`/disputas/${queue.data.competition.id}`}
            className="min-h-11 content-center text-primary underline"
          >
            Ver o placar
          </Link>
        </div>
      )}

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
            Use "Adicionar" ou peça para cada convidado escolher pelo celular: é só escanear o QR code.
          </p>
          <Button variant="secondary" onClick={() => setIsAccessOpen(true)}>
            <Smartphone aria-hidden="true" className="size-5" />
            Mostrar o QR code
          </Button>
        </div>
      )}

      {requests.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={requests.map((request) => request.id)}
            strategy={verticalListSortingStrategy}
          >
            <ol aria-label="Fila de cantores" className="flex flex-col gap-2">
              {requests.map((request, index) => (
                <RequestRow
                  key={request.id}
                  request={request}
                  index={index}
                  total={requests.length}
                  isNext={request.id === next?.id}
                  onMove={move}
                  onRemove={() => remove(request)}
                  onCall={() => navigate(singRequestRoute(request))}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      <AddRequestModal isOpen={isAdding} onClose={() => setIsAdding(false)} />
      <AccessQrModal isOpen={isAccessOpen} onClose={() => setIsAccessOpen(false)} />
    </div>
  );
}
