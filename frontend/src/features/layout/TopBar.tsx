import clsx from 'clsx';
import { Menu, Search, Smartphone, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { useSingQueueQuery } from '../../api/singQueue';
import { AccessQrModal } from '../mobile/AccessQrModal';
import { HealthIndicator } from '../health/HealthIndicator';
import { QueueIndicator } from '../processing/QueueIndicator';
import { NAV_ITEMS } from './navItems';
import { ProfileMenu } from './ProfileMenu';
import { SearchBox } from './SearchBox';

function SingQueueCount() {
  const count = useSingQueueQuery().data?.items.length ?? 0;
  if (count === 0) return null;
  return (
    <>
      <span
        aria-hidden="true"
        className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-sm font-semibold text-primary-contrast"
      >
        {count}
      </span>
      <span className="sr-only">, {count} na fila</span>
    </>
  );
}

const ICON_BUTTON_CLASSES =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-surface-2';

export function TopBar() {
  const { pathname } = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAccessOpen, setIsAccessOpen] = useState(false);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-30 border-b border-surface-2 bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-1 px-2 py-2 sm:px-4 xl:gap-3">
        <button
          type="button"
          aria-label={isMenuOpen ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((open) => !open)}
          className={clsx(ICON_BUTTON_CLASSES, 'xl:hidden')}
        >
          {isMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>

        <Link to="/" className="mr-1 font-display text-2xl text-primary sm:mr-2 sm:text-3xl">
          Karaokê
        </Link>

        <nav
          aria-label="Navegação principal"
          className={clsx(
            'order-last w-full flex-col gap-1 xl:order-none xl:flex xl:w-auto xl:flex-row',
            isMenuOpen ? 'flex' : 'hidden',
          )}
        >
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'inline-flex min-h-11 items-center rounded-lg px-3 text-base hover:bg-surface-2 xl:px-2 2xl:px-3',
                  isActive ? 'font-semibold text-primary' : 'text-text',
                )
              }
            >
              {item.label}
              {item.showsSingQueueCount && <SingQueueCount />}
            </NavLink>
          ))}
        </nav>

        <div className="flex-1" />

        <SearchBox isOpenOnSmallScreens={isSearchOpen} onSubmitted={() => setIsSearchOpen(false)} />

        <button
          type="button"
          aria-label="Buscar músicas"
          aria-expanded={isSearchOpen}
          onClick={() => setIsSearchOpen((open) => !open)}
          className={clsx(ICON_BUTTON_CLASSES, '2xl:hidden')}
        >
          <Search aria-hidden="true" />
        </button>

        <HealthIndicator />
        <QueueIndicator />

        <button
          type="button"
          aria-label="QR code para usar o celular"
          title="Usar o celular"
          onClick={() => setIsAccessOpen(true)}
          className={clsx(ICON_BUTTON_CLASSES, 'max-sm:hidden')}
        >
          <Smartphone aria-hidden="true" />
        </button>
        <AccessQrModal isOpen={isAccessOpen} onClose={() => setIsAccessOpen(false)} />

        <ProfileMenu />
      </div>
    </header>
  );
}
