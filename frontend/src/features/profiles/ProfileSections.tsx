import type { ProfileDTO } from '@caraoke/shared';
import { AddProfileTile, ProfileTile } from './ProfileTile';

const TILE_ROW_CLASSES = 'flex w-full flex-wrap justify-center gap-4';

export type NewProfileKind = 'family' | 'guest';

interface ProfileSectionsProps {
  profiles: ProfileDTO[];
  onSelect: (profile: ProfileDTO) => void;
  onAdd: (kind: NewProfileKind) => void;
  isDisabled?: boolean;
}

export function ProfileSections({ profiles, onSelect, onAdd, isDisabled }: ProfileSectionsProps) {
  const family = profiles.filter((profile) => !profile.isGuest);
  const guests = profiles.filter((profile) => profile.isGuest);

  return (
    <>
      <section aria-label="Perfis da família" className={TILE_ROW_CLASSES}>
        {family.map((profile) => (
          <ProfileTile
            key={profile.id}
            name={profile.name}
            avatarId={profile.avatar}
            size="xl"
            onSelect={() => onSelect(profile)}
            isDisabled={isDisabled}
          />
        ))}
        <AddProfileTile label="Adicionar" size="xl" onAdd={() => onAdd('family')} />
      </section>

      <section aria-labelledby="guests-heading" className="flex w-full flex-col gap-4">
        <h2 id="guests-heading" className="border-b border-surface-2 pb-2 text-xl text-muted">
          Convidados
        </h2>
        <div className={TILE_ROW_CLASSES}>
          {guests.map((profile) => (
            <ProfileTile
              key={profile.id}
              name={profile.name}
              avatarId={profile.avatar}
              size="lg"
              onSelect={() => onSelect(profile)}
              isDisabled={isDisabled}
            />
          ))}
          <AddProfileTile label="Convidado" size="lg" onAdd={() => onAdd('guest')} />
        </div>
      </section>
    </>
  );
}
