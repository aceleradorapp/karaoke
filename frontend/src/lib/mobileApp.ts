export const MOBILE_ROOT = '/m';

export function isMobilePath(pathname: string): boolean {
  return pathname === MOBILE_ROOT || pathname.startsWith(`${MOBILE_ROOT}/`);
}

export function isMobileApp(): boolean {
  return typeof window !== 'undefined' && isMobilePath(window.location.pathname);
}
