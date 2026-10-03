import { currentAccessCode } from '../stores/useMobileAccessStore';
import { isMobileApp } from './mobileApp';

export function mediaUrlForDevice(url: string | null): string | null {
  if (!url || !isMobileApp()) return url;
  const code = currentAccessCode();
  if (!code) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}c=${encodeURIComponent(code)}`;
}
