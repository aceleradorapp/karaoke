import { Route, Routes } from 'react-router';
import { ThemeSync } from './components/ThemeSync';
import { ToastViewport } from './components/ToastViewport';
import { HealthPage } from './features/health/HealthPage';
import { ManageProfilesPage } from './features/profiles/ManageProfilesPage';
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
          <Route path="*" element={<HealthPage />} />
        </Route>
      </Routes>
      <ToastViewport />
    </>
  );
}
