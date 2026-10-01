export const AVATARS = [
  { id: 'mic-red', emoji: '🎤', background: '#e50914' },
  { id: 'guitar', emoji: '🎸', background: '#f97316' },
  { id: 'star', emoji: '⭐', background: '#eab308' },
  { id: 'crown', emoji: '👑', background: '#a16207' },
  { id: 'headphones', emoji: '🎧', background: '#16a34a' },
  { id: 'lion', emoji: '🦁', background: '#d97706' },
  { id: 'cat', emoji: '🐱', background: '#0ea5e9' },
  { id: 'dog', emoji: '🐶', background: '#8b5cf6' },
  { id: 'fox', emoji: '🦊', background: '#ea580c' },
  { id: 'panda', emoji: '🐼', background: '#475569' },
  { id: 'frog', emoji: '🐸', background: '#22c55e' },
  { id: 'unicorn', emoji: '🦄', background: '#ec4899' },
  { id: 'rocket', emoji: '🚀', background: '#2563eb' },
  { id: 'robot', emoji: '🤖', background: '#64748b' },
  { id: 'alien', emoji: '👽', background: '#10b981' },
  { id: 'disco', emoji: '🪩', background: '#7c3aed' },
] as const;

export type Avatar = (typeof AVATARS)[number];
export type AvatarId = Avatar['id'];

export const DEFAULT_AVATAR_ID: AvatarId = 'mic-red';

export function isAvatarId(value: string): value is AvatarId {
  return AVATARS.some((avatar) => avatar.id === value);
}

export function findAvatar(id: string): Avatar {
  return AVATARS.find((avatar) => avatar.id === id) ?? AVATARS[0];
}
