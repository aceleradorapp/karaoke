import clsx from 'clsx';
import { Plus } from 'lucide-react';
import { AVATAR_SIZE_CLASSES, Avatar, type AvatarSize } from '../../components/Avatar';

const TILE_BASE_CLASSES =
  'group flex flex-col items-center gap-3 rounded-2xl p-2 text-center transition hover:scale-105';

const TILE_WIDTH_CLASSES: Record<AvatarSize, string> = {
  sm: 'w-20',
  md: 'w-24',
  lg: 'w-32 sm:w-36',
  xl: 'w-36 sm:w-44 lg:w-48',
};

interface ProfileTileProps {
  name: string;
  avatarId: string;
  size: AvatarSize;
  onSelect: () => void;
  isDisabled?: boolean;
}

export function ProfileTile({ name, avatarId, size, onSelect, isDisabled }: ProfileTileProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={isDisabled}
      className={clsx(TILE_BASE_CLASSES, TILE_WIDTH_CLASSES[size])}
    >
      <Avatar avatarId={avatarId} size={size} className="group-hover:ring-4 group-hover:ring-text" />
      <span className="w-full truncate text-lg text-muted group-hover:text-text">{name}</span>
    </button>
  );
}

interface AddProfileTileProps {
  label: string;
  size: AvatarSize;
  onAdd: () => void;
}

export function AddProfileTile({ label, size, onAdd }: AddProfileTileProps) {
  return (
    <button type="button" onClick={onAdd} className={clsx(TILE_BASE_CLASSES, TILE_WIDTH_CLASSES[size])}>
      <span
        className={clsx(
          'inline-flex items-center justify-center border-2 border-dashed border-muted text-muted',
          'group-hover:border-text group-hover:text-text',
          AVATAR_SIZE_CLASSES[size],
        )}
      >
        <Plus aria-hidden="true" className="size-1/3" />
      </span>
      <span className="w-full truncate text-lg text-muted group-hover:text-text">{label}</span>
    </button>
  );
}
