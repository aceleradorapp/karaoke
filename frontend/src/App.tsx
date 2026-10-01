import { Route, Routes } from 'react-router';
import { HealthPage } from './features/health/HealthPage';

export function App() {
  return (
    <Routes>
      <Route path="*" element={<HealthPage />} />
    </Routes>
  );
}
