export interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Início', end: true },
  { to: '/biblioteca', label: 'Biblioteca' },
  { to: '/youtube', label: 'YouTube' },
  { to: '/playlists', label: 'Playlists' },
  { to: '/ranking', label: 'Ranking' },
];

export const PROFILE_MENU_ITEMS: NavItem[] = [
  { to: '/favoritas', label: 'Favoritas' },
  { to: '/historico', label: 'Histórico' },
  { to: '/configuracoes', label: 'Configurações' },
  { to: '/perfis', label: 'Trocar perfil' },
];
