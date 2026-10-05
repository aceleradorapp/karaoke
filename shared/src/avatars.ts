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
  { id: 'sorriso-ana', emoji: '🙂', background: '#fde68a', image: '/avatars/sorriso-ana.svg' },
  { id: 'sorriso-bia', emoji: '🙂', background: '#fbcfe8', image: '/avatars/sorriso-bia.svg' },
  { id: 'sorriso-duda', emoji: '🙂', background: '#c7d2fe', image: '/avatars/sorriso-duda.svg' },
  { id: 'sorriso-gui', emoji: '🙂', background: '#fed7aa', image: '/avatars/sorriso-gui.svg' },
  { id: 'sorriso-leo', emoji: '🙂', background: '#bbf7d0', image: '/avatars/sorriso-leo.svg' },
  { id: 'sorriso-lia', emoji: '🙂', background: '#bae6fd', image: '/avatars/sorriso-lia.svg' },
  { id: 'sorriso-max', emoji: '🙂', background: '#ddd6fe', image: '/avatars/sorriso-max.svg' },
  { id: 'sorriso-theo', emoji: '🙂', background: '#fecaca', image: '/avatars/sorriso-theo.svg' },
  { id: 'robo-byte', emoji: '🙂', background: '#1e293b', image: '/avatars/robo-byte.svg' },
  { id: 'robo-disco', emoji: '🙂', background: '#312e81', image: '/avatars/robo-disco.svg' },
  { id: 'robo-mic', emoji: '🙂', background: '#0f766e', image: '/avatars/robo-mic.svg' },
  { id: 'robo-neon', emoji: '🙂', background: '#4c1d95', image: '/avatars/robo-neon.svg' },
  { id: 'robo-turbo', emoji: '🙂', background: '#7c2d12', image: '/avatars/robo-turbo.svg' },
  { id: 'robo-volt', emoji: '🙂', background: '#134e4a', image: '/avatars/robo-volt.svg' },
  { id: 'emoji-piscada', emoji: '🙂', background: '#d6884f', image: '/avatars/emoji-piscada.svg' },
  { id: 'emoji-beijo', emoji: '🙂', background: '#f5b833', image: '/avatars/emoji-beijo.svg' },
  { id: 'emoji-lingua', emoji: '🙂', background: '#f5b833', image: '/avatars/emoji-lingua.svg' },
  { id: 'emoji-apaixonado', emoji: '🙂', background: '#d946ef', image: '/avatars/emoji-apaixonado.svg' },
  { id: 'emoji-oculos', emoji: '🙂', background: '#d946ef', image: '/avatars/emoji-oculos.svg' },
  { id: 'rabisco-pirata', emoji: '🙂', background: '#f1f5f9', image: '/avatars/rabisco-pirata.svg' },
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
