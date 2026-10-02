import os from 'node:os';

type InterfaceMap = NodeJS.Dict<os.NetworkInterfaceInfo[]>;

const HOME_NETWORK_PREFIX = '192.168.';
const LINK_LOCAL_PREFIX = '169.254.';

function rank(address: string): number {
  if (address.startsWith(HOME_NETWORK_PREFIX)) return 0;
  if (address.startsWith('10.')) return 1;
  return 2;
}

function isPrivate(address: string): boolean {
  if (address.startsWith(HOME_NETWORK_PREFIX) || address.startsWith('10.')) return true;
  const [first, second] = address.split('.').map(Number);
  return first === 172 && second !== undefined && second >= 16 && second <= 31;
}

export function listPrivateIPv4(interfaces: InterfaceMap = os.networkInterfaces()): string[] {
  const addresses = Object.values(interfaces)
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address)
    .filter((address) => isPrivate(address) && !address.startsWith(LINK_LOCAL_PREFIX));

  const unique = [...new Set(addresses)];
  const hasHomeNetwork = unique.some((address) => address.startsWith(HOME_NETWORK_PREFIX));
  return unique
    .filter((address) => !(hasHomeNetwork && address.startsWith('172.')))
    .sort((a, b) => rank(a) - rank(b));
}

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isLoopback(address: string | undefined): boolean {
  return address !== undefined && LOOPBACK_ADDRESSES.has(address);
}

export function clientAddress(
  directAddress: string | undefined,
  forwardedFor: string | string[] | undefined,
): string | undefined {
  if (!isLoopback(directAddress)) return directAddress;
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor;
  const nearest = header?.split(',').at(-1)?.trim();
  return nearest ? nearest.replace(/^::ffff:/, '') : directAddress;
}
