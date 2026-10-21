import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const caddyfile = readFileSync(path.resolve(here, '../../../../deploy/Caddyfile'), 'utf8');

const CLOUDFLARE_RANGES = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
  '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
];

/** Returns the body of the `{ ... }` block that opens at `openIndex`. */
function blockAt(text: string, openIndex: number): string {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === '{' && text[i + 1] !== '$') depth++;
    if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(openIndex + 1, i);
    }
  }
  throw new Error('Unbalanced braces in Caddyfile');
}

describe('deploy/Caddyfile real client IP', () => {
  it('starts with a global options block that trusts CF-Connecting-IP from Cloudflare', () => {
    expect(caddyfile.trimStart().startsWith('{')).toBe(true);
    const global = blockAt(caddyfile, caddyfile.indexOf('{'));
    expect(global).toContain('servers');
    expect(global).toMatch(/client_ip_headers\s+CF-Connecting-IP/);
    expect(global).toMatch(/trusted_proxies\s+static/);
    expect(global).toContain('https://www.cloudflare.com/ips/');
  });

  it.each(CLOUDFLARE_RANGES)('lists the Cloudflare range %s', (range) => {
    const re = new RegExp(`(^|\\s)${range.replace(/[./]/g, '\\$&')}(\\s|\\\\|$)`, 'm');
    expect(caddyfile).toMatch(re);
  });

  it('lists nothing but the 22 Cloudflare ranges as trusted proxies', () => {
    const found = caddyfile.match(/^\s*[0-9a-f:.]+\/\d+/gim) ?? [];
    expect(found.map((r) => r.trim()).sort()).toEqual([...CLOUDFLARE_RANGES].sort());
  });

  it('forwards the verified client IP on each of the 3 reverse_proxy blocks', () => {
    const proxies = [...caddyfile.matchAll(/reverse_proxy\s+(\S+)\s*\{/g)];
    expect(proxies.map((m) => m[1])).toEqual(['client:3000', 'api:5000', 'admin:3001']);
    expect(caddyfile.match(/reverse_proxy\s/g)).toHaveLength(3);
    for (const m of proxies) {
      const body = blockAt(caddyfile, m.index! + m[0].length - 1);
      expect(body).toMatch(/header_up\s+X-Forwarded-For\s+\{client_ip\}/);
      expect(body).toMatch(/header_up\s+X-Real-IP\s+\{client_ip\}/);
    }
  });
});
