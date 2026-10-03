import type { ProfileDTO } from '@caraoke/shared';
import clsx from 'clsx';
import { UserPlus } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';

interface SingerPickerProps {
  profiles: ProfileDTO[];
  isLoading: boolean;
  selectedId: string | null;
  songTitle: string;
  songArtist: string;
  title?: string;
  onSelect: (profileId: string) => void;
  onAddGuest?: () => void;
  onStart: () => void;
  onBack: () => void;
}

export function SingerPicker({
  profiles,
  isLoading,
  selectedId,
  songTitle,
  songArtist,
  title = 'Quem vai cantar esta?',
  onSelect,
  onAddGuest,
  onStart,
  onBack,
}: SingerPickerProps) {
  return (
    <div className="flex w-full max-w-4xl flex-col items-center gap-8 px-4 text-center">
      <div>
        <p className="text-lg text-muted">{songArtist}</p>
        <h1 className="font-display text-4xl leading-tight sm:text-6xl">{songTitle}</h1>
      </div>

      <h2 className="text-2xl font-semibold">{title}</h2>

      {isLoading ? (
        <Spinner className="size-8" />
      ) : (
        <div className="flex flex-wrap justify-center gap-3">
          <div role="radiogroup" aria-label="Quem vai cantar" className="contents">
            {profiles.map((profile) => {
              const isSelected = profile.id === selectedId;
              return (
                <button
                  key={profile.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onSelect(profile.id)}
                  className={clsx(
                    'flex w-28 flex-col items-center gap-2 rounded-2xl p-3 transition',
                    isSelected ? 'bg-surface-2 ring-4 ring-primary' : 'opacity-70 hover:opacity-100',
                  )}
                >
                  <Avatar avatarId={profile.avatar} size="lg" />
                  <span className="w-full truncate text-base">{profile.name}</span>
                </button>
              );
            })}
          </div>
          {onAddGuest && (
            <button
              type="button"
              onClick={onAddGuest}
              className="flex w-28 flex-col items-center gap-2 rounded-2xl p-3 opacity-70 transition hover:opacity-100"
            >
              <span className="inline-flex size-24 items-center justify-center rounded-xl border-2 border-dashed border-white/40 sm:size-28">
                <UserPlus aria-hidden="true" className="size-10" />
              </span>
              <span className="w-full truncate text-base">+ Convidado</span>
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="ghost" size="lg" onClick={onBack}>
          Voltar
        </Button>
        <Button size="lg" onClick={onStart} disabled={!selectedId} autoFocus>
          Começar
        </Button>
      </div>
    </div>
  );
}
