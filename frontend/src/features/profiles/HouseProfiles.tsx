import type { ProfileDTO } from '@caraoke/shared';
import { AddProfileTile, ProfileTile } from './ProfileTile';

interface HouseProfilesProps {
  profiles: ProfileDTO[];
  onSelect: (profile: ProfileDTO) => void;
  onAdd: () => void;
  isDisabled?: boolean;
}

export function HouseProfiles({ profiles, onSelect, onAdd, isDisabled }: HouseProfilesProps) {
  return (
    <section aria-label="Perfis da casa" className="flex w-full flex-wrap justify-center gap-4">
      {profiles
        .filter((profile) => !profile.isGuest)
        .map((profile) => (
          <ProfileTile
            key={profile.id}
            name={profile.name}
            avatarId={profile.avatar}
            size="xl"
            onSelect={() => onSelect(profile)}
            isDisabled={isDisabled}
          />
        ))}
      <AddProfileTile label="Adicionar" size="xl" onAdd={onAdd} />
    </section>
  );
}
