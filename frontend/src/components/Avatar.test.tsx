import { AVATARS } from '@caraoke/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('shows the emoji of the classic avatars', () => {
    render(<Avatar avatarId="lion" label="Ana" />);
    expect(screen.getByRole('img', { name: 'Ana' })).toHaveTextContent('🦁');
  });

  it('shows the picture of the fun avatars', () => {
    render(<Avatar avatarId="robo-mic" label="Bia" />);
    const avatar = screen.getByRole('img', { name: 'Bia' });
    expect(avatar.querySelector('img')).toHaveAttribute('src', '/avatars/robo-mic.svg');
  });

  it('falls back to the first avatar for an unknown id', () => {
    render(<Avatar avatarId="nao-existe" label="Carla" />);
    expect(screen.getByRole('img', { name: 'Carla' })).toHaveTextContent('🎤');
  });

  it('has 20 fun pictures with unique ids, each in the public avatars folder', () => {
    const ids = AVATARS.map((avatar) => avatar.id);
    const pictures = AVATARS.filter((avatar) => 'image' in avatar);
    expect(new Set(ids).size).toBe(ids.length);
    expect(pictures).toHaveLength(20);
    for (const avatar of pictures) {
      expect('image' in avatar && avatar.image).toBe(`/avatars/${avatar.id}.svg`);
      expect(avatar.id.length).toBeLessThanOrEqual(40);
    }
  });
});
