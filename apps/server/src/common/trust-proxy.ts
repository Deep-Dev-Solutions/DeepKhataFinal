import type { INestApplication } from '@nestjs/common';

/**
 * Express "trust proxy" setting: X-Forwarded-For is honoured only when the
 * direct peer matches TRUST_PROXY (default: loopback). In production that is
 * the compose network of Caddy (172.16.0.0/12), and Caddy overwrites
 * X-Forwarded-For with the verified client IP, so `req.ip` is the true visitor.
 */
export function configureTrustProxy(app: INestApplication): void {
  app
    .getHttpAdapter()
    .getInstance()
    .set('trust proxy', process.env.TRUST_PROXY || 'loopback');
}
