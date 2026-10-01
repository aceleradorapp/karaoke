import { findAvatar } from '@caraoke/shared';
import clsx from 'clsx';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  avatarId: string;
  size?: AvatarSize;
  label?: string;
  className?: string;
}

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: 'size-10 text-xl rounded-lg',
  md: 'size-16 text-3xl rounded-xl',
  lg: 'size-24 text-5xl rounded-xl sm:size-28',
  xl: 'size-28 text-6xl rounded-2xl sm:size-36 sm:text-7xl lg:size-40',
};

export function Avatar({ avatarId, size = 'md', label, className }: AvatarProps) {
  const avatar = findAvatar(avatarId);
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ backgroundColor: avatar.background }}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center select-none',
        SIZE_CLASSES[size],
        className,
      )}
    >
      {avatar.emoji}
    </span>
  );
}
