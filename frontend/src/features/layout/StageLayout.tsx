import { Outlet } from 'react-router';
import { PlaylistPicker } from '../playlists/PlaylistPicker';
import { TopBar } from './TopBar';

export function StageLayout() {
  return (
    <div className="min-h-dvh bg-bg text-text">
      <TopBar />
      <main className="mx-auto w-full max-w-screen-2xl px-3 py-6 sm:px-4">
        <Outlet />
      </main>
      <PlaylistPicker />
    </div>
  );
}
