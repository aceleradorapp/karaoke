export interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  showsSingQueueCount?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Início', end: true },
  { to: '/biblioteca', label: 'Biblioteca' },
  { to: '/proximos', label: 'Próximos', showsSingQueueCount: true },
  { to: '/youtube', label: 'YouTube' },
  { to: '/enviar', label: 'Enviar' },
  { to: '/playlists', label: 'Playlists' },
  { to: '/ranking', label: 'Ranking' },
];

export const PROFILE_MENU_ITEMS: NavItem[] = [
  { to: '/favoritas', label: 'Favoritas' },
  { to: '/historico', label: 'Histórico' },
  { to: '/perfis/gerenciar', label: 'Gerenciar perfis' },
  { to: '/configuracoes', label: 'Configurações' },
  { to: '/perfis', label: 'Trocar perfil' },
];
