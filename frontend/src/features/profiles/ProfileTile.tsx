import clsx from 'clsx';
import { Plus } from 'lucide-react';
import { AVATAR_SIZE_CLASSES, Avatar, type AvatarSize } from '../../components/Avatar';

const TILE_CLASSES =
  'group flex w-full max-w-40 flex-col items-center gap-3 rounded-2xl p-2 text-center transition hover:scale-105';

interface ProfileTileProps {
  name: string;
  avatarId: string;
  size: AvatarSize;
  onSelect: () => void;
  isDisabled?: boolean;
}

export function ProfileTile({ name, avatarId, size, onSelect, isDisabled }: ProfileTileProps) {
  return (
    <button type="button" onClick={onSelect} disabled={isDisabled} className={TILE_CLASSES}>
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
    <button type="button" onClick={onAdd} className={TILE_CLASSES}>
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
