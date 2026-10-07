import type { ProfileDTO } from '@caraoke/shared';
import clsx from 'clsx';
import { ChevronDown, Search, UserPlus } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useGuestsQuery } from '../../api/profiles';
import { Avatar } from '../../components/Avatar';
import { formatTimeAgo } from '../../lib/format';

type ChooserSize = 'lg' | 'sm';

interface SingerChooserProps {
  profiles: ProfileDTO[];
  defaultProfileId: string | null;
  selectedId: string | null;
  onSelect: (profileId: string) => void;
  onCreateGuest: () => void;
  size?: ChooserSize;
}

interface PersonOption {
  profile: ProfileDTO;
  detail: string | null;
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function PersonRow({ option, isSelected, onPick }: { option: PersonOption; isSelected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={isSelected}
      className={clsx(
        'flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition',
        isSelected ? 'bg-surface-2 ring-2 ring-primary' : 'hover:bg-surface-2',
      )}
    >
      <Avatar avatarId={option.profile.avatar} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold">{option.profile.name}</span>
        {option.detail && <span className="block truncate text-xs text-muted">{option.detail}</span>}
      </span>
    </button>
  );
}

export function SingerChooser({
  profiles,
  defaultProfileId,
  selectedId,
  onSelect,
  onCreateGuest,
  size = 'lg',
}: SingerChooserProps) {
  const guests = useGuestsQuery();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const panelId = useId();

  const shown =
    profiles.find((profile) => profile.id === selectedId) ??
    profiles.find((profile) => profile.id === defaultProfileId) ??
    null;

  const { house, guestOptions } = useMemo(() => {
    const term = normalize(search.trim());
    const matches = (profile: ProfileDTO) => !term || normalize(profile.name).includes(term);
    const houseProfiles = profiles.filter((profile) => !profile.isGuest && matches(profile));
    const guestList: PersonOption[] = guests.data
      ? guests.data.map((guest) => ({
          profile: guest,
          detail: guest.lastSungAt ? `cantou ${formatTimeAgo(guest.lastSungAt)}` : 'ainda não cantou',
        }))
      : profiles.filter((profile) => profile.isGuest).map((profile) => ({ profile, detail: null }));
    return {
      house: houseProfiles.map((profile) => ({ profile, detail: null })),
      guestOptions: guestList.filter((option) => matches(option.profile)),
    };
  }, [profiles, guests.data, search]);

  function pick(profileId: string) {
    onSelect(profileId);
    setIsOpen(false);
    setSearch('');
  }

  const isLarge = size === 'lg';

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex flex-wrap items-end justify-center gap-3">
        {shown && (
          <div
            role="radiogroup"
            aria-label="Quem vai cantar"
            className="contents"
          >
            <button
              type="button"
              role="radio"
              aria-checked={shown.id === selectedId}
              onClick={() => onSelect(shown.id)}
              className={clsx(
                'flex flex-col items-center gap-2 rounded-2xl p-3 transition',
                isLarge ? 'w-32' : 'w-24',
                shown.id === selectedId ? 'bg-surface-2 ring-4 ring-primary' : 'opacity-80 hover:opacity-100',
              )}
            >
              <Avatar avatarId={shown.avatar} size={isLarge ? 'lg' : 'md'} />
              <span className="w-full truncate text-base">{shown.name}</span>
            </button>
          </div>
        )}
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((open) => !open)}
          className={clsx(
            'inline-flex min-h-12 items-center gap-2 rounded-full bg-surface-2 px-5 text-base font-semibold',
            'hover:bg-surface',
          )}
        >
          Convidado
          <ChevronDown aria-hidden="true" className={clsx('size-5 transition', isOpen && 'rotate-180')} />
        </button>
      </div>

      {isOpen && (
        <div
          id={panelId}
          role="region"
          aria-label="Escolher quem vai cantar"
          className="flex w-full max-w-md flex-col gap-3 rounded-2xl bg-surface p-3 text-left shadow-2xl"
        >
          <label className="flex min-h-11 items-center gap-2 rounded-lg bg-surface-2 px-3">
            <Search aria-hidden="true" className="size-5 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Buscar pessoa"
              placeholder="Buscar pelo nome…"
              autoFocus
              className="min-h-11 w-full bg-transparent text-base text-text outline-none"
            />
          </label>

          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onCreateGuest();
            }}
            className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left font-semibold hover:bg-surface-2"
          >
            <span className="inline-flex size-10 items-center justify-center rounded-lg border-2 border-dashed border-muted">
              <UserPlus aria-hidden="true" className="size-5" />
            </span>
            Novo convidado
          </button>

          <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
            {guestOptions.length > 0 && (
              <section aria-label="Convidados" className="flex flex-col gap-1">
                <h3 className="px-1 text-sm text-muted">Convidados</h3>
                {guestOptions.map((option) => (
                  <PersonRow
                    key={option.profile.id}
                    option={option}
                    isSelected={option.profile.id === selectedId}
                    onPick={() => pick(option.profile.id)}
                  />
                ))}
              </section>
            )}
            {house.length > 0 && (
              <section aria-label="Da casa" className="flex flex-col gap-1">
                <h3 className="px-1 text-sm text-muted">Da casa</h3>
                {house.map((option) => (
                  <PersonRow
                    key={option.profile.id}
                    option={option}
                    isSelected={option.profile.id === selectedId}
                    onPick={() => pick(option.profile.id)}
                  />
                ))}
              </section>
            )}
            {guestOptions.length === 0 && house.length === 0 && (
              <p className="px-1 text-sm text-muted">Ninguém com esse nome. Crie um novo convidado.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
