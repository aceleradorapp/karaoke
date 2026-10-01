import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Avatar } from '../../components/Avatar';
import { useDismiss } from '../../lib/useDismiss';
import { useProfileStore } from '../../stores/useProfileStore';
import { PROFILE_MENU_ITEMS } from './navItems';

export function ProfileMenu() {
  const profile = useProfileStore((state) => state.currentProfile);
  const { pathname } = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useDismiss(containerRef, isOpen, () => setIsOpen(false));

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  if (!profile) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label={`Menu do perfil ${profile.name}`}
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg px-1 hover:bg-surface-2 sm:px-2"
      >
        <Avatar avatarId={profile.avatar} size="sm" />
        <span className="hidden max-w-32 truncate text-base sm:inline">{profile.name}</span>
        <ChevronDown aria-hidden="true" className="hidden size-4 sm:block" />
      </button>

      {isOpen && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 flex w-56 flex-col rounded-xl bg-surface p-2 shadow-xl"
        >
          {PROFILE_MENU_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              role="menuitem"
              className="flex min-h-11 items-center rounded-lg px-3 text-base hover:bg-surface-2"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
