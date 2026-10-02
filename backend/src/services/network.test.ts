import type os from 'node:os';
import { describe, expect, it } from 'vitest';
import { clientAddress, isLoopback, listPrivateIPv4 } from './network.js';

function iface(address: string, overrides: Partial<os.NetworkInterfaceInfo> = {}): os.NetworkInterfaceInfo {
  return {
    address,
    netmask: '255.255.255.0',
    family: 'IPv4',
    mac: '00:00:00:00:00:00',
    internal: false,
    cidr: `${address}/24`,
    ...overrides,
  } as os.NetworkInterfaceInfo;
}

describe('listPrivateIPv4', () => {
  it('lists the private addresses of the PC, the home network first', () => {
    const addresses = listPrivateIPv4({
      Ethernet: [iface('10.0.0.5')],
      WiFi: [iface('192.168.98.10')],
    });
    expect(addresses).toEqual(['192.168.98.10', '10.0.0.5']);
  });

  it('ignores loopback, IPv6, public and link-local addresses', () => {
    const addresses = listPrivateIPv4({
      Loopback: [iface('127.0.0.1', { internal: true })],
      WiFi: [
        iface('192.168.0.20'),
        iface('fe80::1', { family: 'IPv6' } as Partial<os.NetworkInterfaceInfo>),
        iface('169.254.10.2'),
        iface('8.8.8.8'),
      ],
    });
    expect(addresses).toEqual(['192.168.0.20']);
  });

  it('hides the 172.x virtual networks (WSL, Hyper-V) when there is a home network', () => {
    const addresses = listPrivateIPv4({
      'vEthernet (WSL)': [iface('172.24.160.1')],
      WiFi: [iface('192.168.1.7')],
    });
    expect(addresses).toEqual(['192.168.1.7']);
  });

  it('keeps a 172.16-31 address when it is the only network', () => {
    expect(listPrivateIPv4({ Office: [iface('172.20.1.4')] })).toEqual(['172.20.1.4']);
    expect(listPrivateIPv4({ Other: [iface('172.40.1.4')] })).toEqual([]);
  });

  it('does not repeat an address and handles no interfaces', () => {
    expect(listPrivateIPv4({ A: [iface('192.168.1.7')], B: [iface('192.168.1.7')] })).toEqual([
      '192.168.1.7',
    ]);
    expect(listPrivateIPv4({})).toEqual([]);
  });
});

describe('client address', () => {
  it('recognizes the loopback addresses', () => {
    for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) expect(isLoopback(address)).toBe(true);
    expect(isLoopback('192.168.0.50')).toBe(false);
    expect(isLoopback(undefined)).toBe(false);
  });

  it('uses the address the local proxy added for requests that came through it', () => {
    expect(clientAddress('127.0.0.1', '192.168.0.50')).toBe('192.168.0.50');
    expect(clientAddress('::1', '::ffff:192.168.0.50')).toBe('192.168.0.50');
  });

  it('cannot be fooled by a fake address sent by the phone before the proxy', () => {
    expect(clientAddress('127.0.0.1', '127.0.0.1, 192.168.0.50')).toBe('192.168.0.50');
  });

  it('ignores the forwarded header when the request did not come from the local proxy', () => {
    expect(clientAddress('192.168.0.50', '127.0.0.1')).toBe('192.168.0.50');
  });

  it('keeps the loopback address for the stage itself', () => {
    expect(clientAddress('127.0.0.1', undefined)).toBe('127.0.0.1');
  });
});
