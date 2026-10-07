import type { ProfileDTO } from '@caraoke/shared';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { SingerChooser } from '../profiles/SingerChooser';

interface SingerPickerProps {
  profiles: ProfileDTO[];
  isLoading: boolean;
  selectedId: string | null;
  defaultProfileId: string | null;
  songTitle: string;
  songArtist: string;
  title?: string;
  onSelect: (profileId: string) => void;
  onAddGuest: () => void;
  onStart: () => void;
  onBack: () => void;
}

export function SingerPicker({
  profiles,
  isLoading,
  selectedId,
  defaultProfileId,
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
        <SingerChooser
          profiles={profiles}
          defaultProfileId={defaultProfileId}
          selectedId={selectedId}
          onSelect={onSelect}
          onCreateGuest={onAddGuest}
        />
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
