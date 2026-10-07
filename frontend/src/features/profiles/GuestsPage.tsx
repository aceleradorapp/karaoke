import { STALE_GUEST_DEFAULT_DAYS, type GuestDTO } from '@caraoke/shared';
import clsx from 'clsx';
import { Brush, CheckSquare, Search, Trash2, UserPlus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useDeleteGuestsMutation, useGuestsQuery, useStaleGuestsQuery } from '../../api/profiles';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Spinner } from '../../components/Spinner';
import { formatTimeAgo } from '../../lib/format';
import { toast } from '../../stores/useToastStore';
import { CreateProfileModal } from './CreateProfileModal';
import { GuestEditorModal } from './GuestEditorModal';

const NAMES_SHOWN_IN_CLEANUP = 8;

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function guestsLabel(count: number): string {
  return count === 1 ? '1 convidado' : `${count} convidados`;
}

function activityText(guest: GuestDTO): string {
  if (!guest.lastSungAt) return `ainda não cantou · chegou ${formatTimeAgo(guest.createdAt)}`;
  const times = guest.timesSung === 1 ? '1 vez' : `${guest.timesSung} vezes`;
  return `cantou ${formatTimeAgo(guest.lastSungAt)} · ${times}`;
}

type PendingDeletion = { kind: 'selected' | 'single' | 'stale'; guests: GuestDTO[] };

export function GuestsPage() {
  const guests = useGuestsQuery();
  const deleteGuests = useDeleteGuestsMutation();
  const [search, setSearch] = useState('');
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isAskingCleanup, setIsAskingCleanup] = useState(false);
  const [pending, setPending] = useState<PendingDeletion | null>(null);
  const stale = useStaleGuestsQuery(STALE_GUEST_DEFAULT_DAYS, isAskingCleanup);

  const all = guests.data ?? [];
  const visible = useMemo(() => {
    const term = normalize(search.trim());
    return term ? all.filter((guest) => normalize(guest.name).includes(term)) : all;
  }, [all, search]);
  const editing = all.find((guest) => guest.id === editingId) ?? null;
  const areAllSelected = visible.length > 0 && visible.every((guest) => selectedIds.has(guest.id));

  function stopSelecting() {
    setIsSelecting(false);
    setSelectedIds(new Set());
  }

  function toggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmDeletion() {
    if (!pending) return;
    const ids = pending.guests.map((guest) => guest.id);
    setPending(null);
    setIsAskingCleanup(false);
    setEditingId(null);
    deleteGuests.mutate(ids, {
      onSuccess: (result) => {
        toast.success(`${guestsLabel(result.deleted.length)} excluído(s)`);
        stopSelecting();
      },
      onError: () => toast.error('Não foi possível excluir'),
    });
  }

  const pendingNames = pending?.guests.map((guest) => guest.name) ?? [];
  const pendingMessage = pending
    ? `Excluir ${guestsLabel(pending.guests.length)}${
        pendingNames.length <= NAMES_SHOWN_IN_CLEANUP ? ` (${pendingNames.join(', ')})` : ''
      }? As notas, os pedidos na fila e o histórico deles também serão apagados, e eles saem do ranking.`
    : '';

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-4xl sm:text-5xl">Convidados</h1>
        <p className="text-base text-muted">
          Quem vem cantar e não é da casa. Os convidados aparecem no botão “Convidado” na hora de cantar e no celular,
          em “Quem é você?”.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl bg-surface-2 px-3">
          <Search aria-hidden="true" className="size-5 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Buscar convidado"
            placeholder="Buscar pelo nome…"
            className="min-h-11 w-full bg-transparent text-base text-text outline-none"
          />
        </label>
        {!isSelecting && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setIsCreating(true)}>
              <UserPlus aria-hidden="true" className="size-5" />
              Novo convidado
            </Button>
            {all.length > 0 && (
              <>
                <Button variant="secondary" onClick={() => setIsSelecting(true)}>
                  <CheckSquare aria-hidden="true" className="size-5" />
                  Selecionar
                </Button>
                <Button variant="secondary" onClick={() => setIsAskingCleanup(true)}>
                  <Brush aria-hidden="true" className="size-5" />
                  Limpar antigos
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {guests.isLoading && <Spinner className="mx-auto size-8" />}
      {guests.isError && (
        <p role="alert" className="text-danger">
          Não foi possível carregar os convidados.
        </p>
      )}
      {guests.isSuccess && all.length === 0 && (
        <p className="rounded-2xl bg-surface p-6 text-lg">Nenhum convidado ainda.</p>
      )}
      {guests.isSuccess && all.length > 0 && visible.length === 0 && (
        <p className="text-muted">Ninguém com esse nome.</p>
      )}

      {visible.length > 0 && (
        <ul aria-label="Lista de convidados" className="flex flex-col gap-2">
          {visible.map((guest) => {
            const isSelected = selectedIds.has(guest.id);
            return (
              <li key={guest.id}>
                <button
                  type="button"
                  {...(isSelecting ? { role: 'checkbox', 'aria-checked': isSelected } : {})}
                  aria-label={isSelecting ? guest.name : `Editar ${guest.name}`}
                  onClick={() => (isSelecting ? toggle(guest.id) : setEditingId(guest.id))}
                  className={clsx(
                    'flex min-h-16 w-full items-center gap-3 rounded-2xl bg-surface p-3 text-left transition hover:bg-surface-2',
                    isSelected && 'ring-2 ring-primary',
                  )}
                >
                  {isSelecting && (
                    <span
                      aria-hidden="true"
                      className={clsx(
                        'flex size-7 shrink-0 items-center justify-center rounded-full border-2',
                        isSelected ? 'border-primary bg-primary text-primary-contrast' : 'border-muted',
                      )}
                    >
                      {isSelected && '✓'}
                    </span>
                  )}
                  <Avatar avatarId={guest.avatar} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{guest.name}</span>
                    <span className="block truncate text-sm text-muted">{activityText(guest)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {isSelecting && (
        <div
          role="toolbar"
          aria-label="Convidados selecionados"
          className="sticky bottom-4 z-30 flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3 shadow-2xl ring-1 ring-white/10"
        >
          <span className="mr-auto px-2 text-base font-semibold" aria-live="polite">
            {selectedIds.size === 0 ? 'Toque nos convidados para marcar' : `${guestsLabel(selectedIds.size)} selecionado(s)`}
          </span>
          <Button
            variant="ghost"
            onClick={() => setSelectedIds(areAllSelected ? new Set() : new Set(visible.map((guest) => guest.id)))}
          >
            {areAllSelected ? 'Desmarcar todos' : 'Marcar todos'}
          </Button>
          <Button
            variant="danger"
            disabled={selectedIds.size === 0}
            isLoading={deleteGuests.isPending}
            onClick={() => setPending({ kind: 'selected', guests: all.filter((guest) => selectedIds.has(guest.id)) })}
          >
            <Trash2 aria-hidden="true" className="size-5" />
            Excluir
          </Button>
          <Button variant="secondary" onClick={stopSelecting}>
            <X aria-hidden="true" className="size-5" />
            Cancelar
          </Button>
        </div>
      )}

      <GuestEditorModal
        guest={editing}
        onClose={() => setEditingId(null)}
        onDelete={(guest) => setPending({ kind: 'single', guests: [guest] })}
      />

      <CreateProfileModal isOpen={isCreating} isGuest onClose={() => setIsCreating(false)} />

      <ConfirmDialog
        isOpen={isAskingCleanup && pending === null}
        title="Limpar convidados antigos"
        message={
          stale.isLoading
            ? 'Procurando…'
            : (stale.data?.length ?? 0) === 0
              ? `Nenhum convidado está há mais de ${STALE_GUEST_DEFAULT_DAYS} dias sem cantar.`
              : `${guestsLabel(stale.data?.length ?? 0)} não canta(m) há mais de ${STALE_GUEST_DEFAULT_DAYS} dias: ${stale.data
                  ?.slice(0, NAMES_SHOWN_IN_CLEANUP)
                  .map((guest) => guest.name)
                  .join(', ')}${(stale.data?.length ?? 0) > NAMES_SHOWN_IN_CLEANUP ? '…' : ''}.`
        }
        confirmLabel={(stale.data?.length ?? 0) > 0 ? 'Revisar e excluir' : 'Ok'}
        dismissLabel="Voltar"
        onConfirm={() => {
          if (stale.data && stale.data.length > 0) setPending({ kind: 'stale', guests: stale.data });
          else setIsAskingCleanup(false);
        }}
        onCancel={() => setIsAskingCleanup(false)}
      />

      <ConfirmDialog
        isOpen={pending !== null}
        title={pending?.kind === 'single' ? 'Excluir convidado' : 'Excluir convidados'}
        message={pendingMessage}
        confirmLabel="Excluir"
        dismissLabel="Voltar"
        onConfirm={confirmDeletion}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
