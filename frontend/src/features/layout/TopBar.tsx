import clsx from 'clsx';
import { ListMusic, Menu, Search, Smartphone, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { NAV_ITEMS } from './navItems';
import { ProfileMenu } from './ProfileMenu';
import { SearchBox } from './SearchBox';

const ICON_BUTTON_CLASSES =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-surface-2';

export function TopBar() {
  const { pathname } = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

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
                  'inline-flex min-h-11 items-center rounded-lg px-3 text-base hover:bg-surface-2',
                  isActive ? 'font-semibold text-primary' : 'text-text',
                )
              }
            >
              {item.label}
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
          className={clsx(ICON_BUTTON_CLASSES, 'xl:hidden')}
        >
          <Search aria-hidden="true" />
        </button>

        <Link to="/fila" aria-label="Fila de processamento" className={ICON_BUTTON_CLASSES}>
          <ListMusic aria-hidden="true" />
        </Link>

        <button
          type="button"
          disabled
          aria-label="QR code de acesso (em breve)"
          title="Em breve"
          className={clsx(ICON_BUTTON_CLASSES, 'max-sm:hidden disabled:opacity-40')}
        >
          <Smartphone aria-hidden="true" />
        </button>

        <ProfileMenu />
      </div>
    </header>
  );
}
