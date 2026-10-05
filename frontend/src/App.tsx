import { Navigate, Route, Routes } from 'react-router';
import { ThemeSync } from './components/ThemeSync';
import { ToastViewport } from './components/ToastViewport';
import { HomePage } from './features/home/HomePage';
import { NotFoundPage } from './features/home/NotFoundPage';
import { LibraryPage } from './features/library/LibraryPage';
import { ManageProfilesPage } from './features/profiles/ManageProfilesPage';
import { StageLayout } from './features/layout/StageLayout';
import { SettingsPage } from './features/settings/SettingsPage';
import { QueuePage } from './features/processing/QueuePage';
import { RankingPage } from './features/ranking/RankingPage';
import { CompetitionPage } from './features/competitions/CompetitionPage';
import { CompetitionsPage } from './features/competitions/CompetitionsPage';
import { SingQueuePage } from './features/singQueue/SingQueuePage';
import { SongDetailPage } from './features/songs/SongDetailPage';
import { UploadPage } from './features/upload/UploadPage';
import { YoutubePage } from './features/youtube/YoutubePage';
import { PlayerPage } from './features/player/PlayerPage';
import { FavoritesPage } from './features/playlists/FavoritesPage';
import { HistoryPage } from './features/playlists/HistoryPage';
import { PlaylistPage } from './features/playlists/PlaylistPage';
import { PlaylistsPage } from './features/playlists/PlaylistsPage';
import { LyricsSyncPage } from './features/sync/LyricsSyncPage';
import { ProfilesPage } from './features/profiles/ProfilesPage';
import { RequireProfile } from './features/profiles/RequireProfile';
import { MobileEntry } from './features/mobile/MobileEntry';
import { MobileLayout } from './features/mobile/MobileLayout';
import { MobileQueuePage } from './features/mobile/MobileQueuePage';
import { MobileSearchPage } from './features/mobile/MobileSearchPage';
import { MobileUploadPage } from './features/mobile/MobileUploadPage';
import { MobileSongsPage } from './features/mobile/MobileSongsPage';
import { MobileWhoAmIPage } from './features/mobile/MobileWhoAmIPage';
import { MobileVotePage } from './features/mobile/MobileVotePage';
import { MobileLyricsPage } from './features/mobile/MobileLyricsPage';

export function App() {
  return (
    <>
      <ThemeSync />
      <Routes>
        <Route path="/m" element={<MobileEntry />} />
        <Route element={<MobileLayout />}>
          <Route path="/m/quem-sou" element={<MobileWhoAmIPage />} />
          <Route path="/m/musicas" element={<MobileSongsPage />} />
          <Route path="/m/buscar" element={<MobileSearchPage />} />
          <Route path="/m/enviar" element={<MobileUploadPage />} />
          <Route path="/m/fila" element={<MobileQueuePage />} />
          <Route path="/m/votar" element={<MobileVotePage />} />
          <Route path="/m/letra" element={<MobileLyricsPage />} />
          <Route path="/m/*" element={<Navigate to="/m/musicas" replace />} />
        </Route>
        <Route path="/perfis" element={<ProfilesPage />} />
        <Route path="/perfis/gerenciar" element={<ManageProfilesPage />} />
        <Route element={<RequireProfile />}>
          <Route path="/player/:songId" element={<PlayerPage />} />
          <Route element={<StageLayout />}>
            <Route path="/configuracoes" element={<SettingsPage />} />
            <Route path="/youtube" element={<YoutubePage />} />
            <Route path="/enviar" element={<UploadPage />} />
            <Route path="/fila" element={<QueuePage />} />
            <Route path="/proximos" element={<SingQueuePage />} />
            <Route path="/ranking" element={<RankingPage />} />
            <Route path="/disputas" element={<CompetitionsPage />} />
            <Route path="/disputas/:id" element={<CompetitionPage />} />
            <Route path="/" element={<HomePage />} />
            <Route path="/biblioteca" element={<LibraryPage />} />
            <Route path="/favoritas" element={<FavoritesPage />} />
            <Route path="/historico" element={<HistoryPage />} />
            <Route path="/playlists" element={<PlaylistsPage />} />
            <Route path="/playlists/:id" element={<PlaylistPage />} />
            <Route path="/musica/:id" element={<SongDetailPage />} />
            <Route path="/musica/:id/sincronizar" element={<LyricsSyncPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
      <ToastViewport />
    </>
  );
}
