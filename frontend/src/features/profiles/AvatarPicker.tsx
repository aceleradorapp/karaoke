import { AVATARS } from '@caraoke/shared';
import clsx from 'clsx';
import { Avatar } from '../../components/Avatar';

interface AvatarPickerProps {
  value: string;
  onChange: (avatarId: string) => void;
}

export function AvatarPicker({ value, onChange }: AvatarPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Avatar"
      className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-3"
    >
      {AVATARS.map((avatar) => {
        const isSelected = avatar.id === value;
        return (
          <button
            key={avatar.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={avatar.id}
            onClick={() => onChange(avatar.id)}
            className={clsx(
              'inline-flex min-h-14 items-center justify-center rounded-xl p-1 transition',
              isSelected ? 'ring-4 ring-primary' : 'opacity-80 hover:opacity-100',
            )}
          >
            <Avatar avatarId={avatar.id} size="md" />
          </button>
        );
      })}
    </div>
  );
}
