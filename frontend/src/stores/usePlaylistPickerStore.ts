import { create } from 'zustand';
import type { SongDTO } from '@caraoke/shared';

interface PlaylistPickerState {
  song: Pick<SongDTO, 'id' | 'title'> | null;
  open: (song: Pick<SongDTO, 'id' | 'title'>) => void;
  close: () => void;
}

export const usePlaylistPickerStore = create<PlaylistPickerState>((set) => ({
  song: null,
  open: (song) => set({ song: { id: song.id, title: song.title } }),
  close: () => set({ song: null }),
}));
