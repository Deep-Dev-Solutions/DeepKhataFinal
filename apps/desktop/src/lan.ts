import * as os from 'node:os';

export type NetworkInterfaces = NodeJS.Dict<os.NetworkInterfaceInfo[]>;

/**
 * Non-internal IPv4 addresses (the ones other counters can reach).
 * Link-local 169.254.x.x addresses are skipped: they mean "no DHCP".
 */
export function getLanAddresses(interfaces: NetworkInterfaces = os.networkInterfaces()): string[] {
  const out: string[] = [];
  for (const infos of Object.values(interfaces)) {
    for (const info of infos ?? []) {
      // Node < 18.4 reported family as the number 4.
      const isV4 = info.family === 'IPv4' || (info.family as unknown) === 4;
      if (!isV4 || info.internal) continue;
      if (info.address.startsWith('169.254.')) continue;
      if (!out.includes(info.address)) out.push(info.address);
    }
  }
  return out;
}

/** LAN mode on -> reachable from other PCs; off -> this PC only. */
export function getBindHost(lanMode: boolean): '0.0.0.0' | '127.0.0.1' {
  return lanMode ? '0.0.0.0' : '127.0.0.1';
}

export function getClientUrls(lanMode: boolean, clientPort: number, addresses: string[]): string[] {
  const urls = [`http://127.0.0.1:${clientPort}`];
  if (lanMode) for (const a of addresses) urls.push(`http://${a}:${clientPort}`);
  return urls;
}

/** Origins the API should accept (CORS_ORIGINS) for the given client URLs. */
export function getCorsOrigins(clientUrls: string[], clientPort: number): string[] {
  return Array.from(new Set([...clientUrls, `http://localhost:${clientPort}`]));
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * Small HTML page listing the URL(s) other counters should open.
 * No QR library is installed (and none may be added here), so this is text
 * only; `qrDataUrl` can be supplied later by a caller that has a QR renderer.
 */
export function renderLanPage(opts: {
  appName: string;
  lanMode: boolean;
  urls: string[];
  qrDataUrl?: string;
}): string {
  const lan = opts.urls.filter((u) => !u.includes('127.0.0.1'));
  const body = !opts.lanMode
    ? `<p>LAN mode is <b>off</b>. Is PC par sirf yehi counter chalta hai. Turn on LAN mode from the tray menu to let other counters connect.</p>`
    : lan.length === 0
      ? `<p>LAN mode is on, but no network address was found. Check the Wi-Fi / LAN cable.</p>`
      : `<p>Open one of these addresses in the browser of the other counters:</p>
<ul>${lan.map((u) => `<li data-testid="lan-url"><code>${esc(u)}</code></li>`).join('')}</ul>${
          opts.qrDataUrl ? `<img alt="QR code" src="${esc(opts.qrDataUrl)}" width="200" height="200" />` : ''
        }`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.appName)} - LAN</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem;max-width:40rem}code{font-size:1.25rem}</style></head>
<body><h1>${esc(opts.appName)} - other counters</h1>${body}</body></html>`;
}
