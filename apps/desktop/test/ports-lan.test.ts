import * as net from 'node:net';
import { describe, expect, it } from 'vitest';
import { getBindHost, getClientUrls, getLanAddresses, renderLanPage } from '../src/lan';
import { getFreePort, getPortOrFree, isPortFree } from '../src/ports';

describe('ports', () => {
  it('getFreePort returns a bindable port', async () => {
    const port = await getFreePort();
    expect(port).toBeGreaterThan(0);
    expect(await isPortFree(port)).toBe(true);
  });

  it('getPortOrFree falls back when the preferred port is taken', async () => {
    const server = net.createServer();
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const taken = (server.address() as net.AddressInfo).port;
    try {
      expect(await isPortFree(taken)).toBe(false);
      const chosen = await getPortOrFree(taken);
      expect(chosen).not.toBe(taken);
    } finally {
      server.close();
    }
  });

  it('getPortOrFree keeps a free preferred port', async () => {
    const free = await getFreePort();
    expect(await getPortOrFree(free)).toBe(free);
  });
});

describe('lan', () => {
  const ifaces = {
    lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    eth0: [
      { address: '192.168.1.20', family: 'IPv4', internal: false },
      { address: 'fe80::1', family: 'IPv6', internal: false },
    ],
    wlan0: [
      { address: '10.0.0.5', family: 'IPv4', internal: false },
      { address: '169.254.10.1', family: 'IPv4', internal: false },
    ],
    dup: [{ address: '192.168.1.20', family: 'IPv4', internal: false }],
    empty: undefined,
  } as unknown as Parameters<typeof getLanAddresses>[0];

  it('keeps only non-internal, non link-local IPv4 addresses', () => {
    expect(getLanAddresses(ifaces)).toEqual(['192.168.1.20', '10.0.0.5']);
  });

  it('binds to loopback unless LAN mode is on', () => {
    expect(getBindHost(false)).toBe('127.0.0.1');
    expect(getBindHost(true)).toBe('0.0.0.0');
  });

  it('lists LAN urls only when enabled', () => {
    expect(getClientUrls(false, 3000, ['10.0.0.5'])).toEqual(['http://127.0.0.1:3000']);
    expect(getClientUrls(true, 3000, ['10.0.0.5'])).toEqual(['http://127.0.0.1:3000', 'http://10.0.0.5:3000']);
  });

  it('renders the url and escapes html', () => {
    const html = renderLanPage({ appName: '<X>', lanMode: true, urls: ['http://127.0.0.1:3000', 'http://10.0.0.5:3000'] });
    expect(html).toContain('http://10.0.0.5:3000');
    expect(html).not.toContain('<X>');
    expect(renderLanPage({ appName: 'A', lanMode: false, urls: [] })).toContain('LAN mode is <b>off</b>');
  });
});
