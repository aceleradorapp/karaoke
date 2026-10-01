import { Route, Routes } from 'react-router';
import { ThemeSync } from './components/ThemeSync';
import { ToastViewport } from './components/ToastViewport';
import { HomePage } from './features/home/HomePage';
import { NotFoundPage } from './features/home/NotFoundPage';
import { LibraryPage } from './features/library/LibraryPage';
import { ManageProfilesPage } from './features/profiles/ManageProfilesPage';
import { StageLayout } from './features/layout/StageLayout';
import { SettingsPage } from './features/settings/SettingsPage';
import { QueuePage } from './features/processing/QueuePage';
import { UploadPage } from './features/upload/UploadPage';
import { YoutubePage } from './features/youtube/YoutubePage';
import { ProfilesPage } from './features/profiles/ProfilesPage';
import { RequireProfile } from './features/profiles/RequireProfile';

export function App() {
  return (
    <>
      <ThemeSync />
      <Routes>
        <Route path="/perfis" element={<ProfilesPage />} />
        <Route path="/perfis/gerenciar" element={<ManageProfilesPage />} />
        <Route element={<RequireProfile />}>
          <Route element={<StageLayout />}>
            <Route path="/configuracoes" element={<SettingsPage />} />
            <Route path="/youtube" element={<YoutubePage />} />
            <Route path="/enviar" element={<UploadPage />} />
            <Route path="/fila" element={<QueuePage />} />
            <Route path="/" element={<HomePage />} />
            <Route path="/biblioteca" element={<LibraryPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
      <ToastViewport />
    </>
  );
}
