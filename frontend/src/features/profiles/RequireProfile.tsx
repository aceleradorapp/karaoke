import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router';
import { useProfilesQuery } from '../../api/profiles';
import { useProfileStore } from '../../stores/useProfileStore';

export function RequireProfile() {
  const profiles = useProfilesQuery();
  const currentProfile = useProfileStore((state) => state.currentProfile);
  const setProfile = useProfileStore((state) => state.setProfile);
  const clearProfile = useProfileStore((state) => state.clear);

  useEffect(() => {
    if (!profiles.data || !currentProfile) return;

    const serverProfile = profiles.data.find((profile) => profile.id === currentProfile.id);
    if (!serverProfile || serverProfile.isGuest) {
      clearProfile();
      return;
    }
    if (JSON.stringify(serverProfile) !== JSON.stringify(currentProfile)) setProfile(serverProfile);
  }, [profiles.data, currentProfile, setProfile, clearProfile]);

  if (!currentProfile || currentProfile.isGuest) return <Navigate to="/perfis" replace />;
  return <Outlet />;
}
