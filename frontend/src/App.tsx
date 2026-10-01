import { Route, Routes } from 'react-router';
import { ToastViewport } from './components/ToastViewport';
import { HealthPage } from './features/health/HealthPage';
import { ProfilesPage } from './features/profiles/ProfilesPage';

export function App() {
  return (
    <>
      <Routes>
        <Route path="/perfis" element={<ProfilesPage />} />
        <Route path="*" element={<HealthPage />} />
      </Routes>
      <ToastViewport />
    </>
  );
}
