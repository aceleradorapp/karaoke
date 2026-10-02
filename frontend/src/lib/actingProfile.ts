import { useMobileProfileStore } from '../stores/useMobileProfileStore';
import { useProfileStore } from '../stores/useProfileStore';
import { isMobileApp } from './mobileApp';

export function useActingProfileId(): string | undefined {
  const stageProfileId = useProfileStore((state) => state.currentProfile?.id);
  const mobileProfileId = useMobileProfileStore((state) => state.profile?.id);
  return isMobileApp() ? mobileProfileId : stageProfileId;
}
