import type { INestApplication } from '@nestjs/common';
import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import {
  auth,
  CLIENT_IP_HEADER,
  REQUIRE_ROLE_HEADER,
} from './better-auth';

/** Request body size limits (express/bytes syntax), chosen by path. */
export const BODY_LIMIT_DEFAULT = '100kb';
/** Credential, invite and public routes carry tiny JSON only. */
export const BODY_LIMIT_SMALL = '16kb';
/** Offline sync batches and bulk import/restock. */
export const BODY_LIMIT_LARGE = '2mb';
export const BODY_LIMIT_SMALL_BYTES = 16 * 1024;
export const BODY_LIMIT_LARGE_BYTES = 2 * 1024 * 1024;

const SMALL_PREFIXES = [
  '/auth',
  '/api/auth',
  '/team',
  '/public',
  '/order/public',
  '/orders/public',
];
const LARGE_PATHS = [
  /^\/sync(\/|$)/,
  /^\/order\/sync\/?$/,
  /^\/orders\/sync\/?$/,
  /^\/product\/import\/?$/,
  /^\/product\/bulk-restock\/?$/,
];

function underPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function bodyLimitFor(path: string): string {
  if (LARGE_PATHS.some((re) => re.test(path))) return BODY_LIMIT_LARGE;
  if (SMALL_PREFIXES.some((p) => underPrefix(path, p))) return BODY_LIMIT_SMALL;
  return BODY_LIMIT_DEFAULT;
}

const PAYLOAD_TOO_LARGE_BODY = {
  statusCode: 413,
  message: 'Payload too large',
  error: 'Payload Too Large',
};

const jsonParsers = {
  [BODY_LIMIT_DEFAULT]: express.json({ limit: BODY_LIMIT_DEFAULT }),
  [BODY_LIMIT_SMALL]: express.json({ limit: BODY_LIMIT_SMALL }),
  [BODY_LIMIT_LARGE]: express.json({ limit: BODY_LIMIT_LARGE }),
};
const urlencodedParsers = {
  [BODY_LIMIT_DEFAULT]: express.urlencoded({ extended: true, limit: BODY_LIMIT_DEFAULT }),
  [BODY_LIMIT_SMALL]: express.urlencoded({ extended: true, limit: BODY_LIMIT_SMALL }),
  [BODY_LIMIT_LARGE]: express.urlencoded({ extended: true, limit: BODY_LIMIT_LARGE }),
};

function payloadTooLarge(res: any): void {
  res.status(413).json(PAYLOAD_TOO_LARGE_BODY);
}

/** Picks the JSON/urlencoded parser by path and answers oversize bodies with a JSON 413. */
function bodyParserByPath(req: any, res: any, next: any): void {
  const limit = bodyLimitFor(req.path) as keyof typeof jsonParsers;
  const onError = (err?: any) => {
    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
      return payloadTooLarge(res);
    }
    next(err);
  };
  jsonParsers[limit](req, res, (err?: any) => {
    if (err) return onError(err);
    urlencodedParsers[limit](req, res, onError);
  });
}

/**
 * Better Auth reads the raw stream itself, so its body is checked up front:
 * a declared Content-Length over the small limit, or a chunked body with no
 * declared length, is refused before the handler sees it.
 */
function limitAuthBody(req: any, res: any, next: any): void {
  const declared = req.headers['content-length'];
  if (declared !== undefined) {
    if (Number(declared) > BODY_LIMIT_SMALL_BYTES) return payloadTooLarge(res);
  } else if (req.headers['transfer-encoding']) {
    return payloadTooLarge(res);
  }
  next();
}

/**
 * Mounts Better Auth at /api/auth/* and then the JSON/urlencoded body parsers.
 * The handler must sit before body parsing (it reads the raw stream), so the
 * Nest app must be created with `bodyParser: false`. Call this before
 * `app.init()` and after `enableCors()`.
 */
export function mountAuth(app: INestApplication): void {
  const server = app.getHttpAdapter().getInstance();
  const handler = toNodeHandler(auth);

  server.all('/api/auth/*splat', limitAuthBody, (req: any, res: any, next: any) => {
    // Internal headers are ours alone: drop anything the client sent, then
    // pass the proxy-aware IP so lockouts and session rows see the real one.
    delete req.headers[REQUIRE_ROLE_HEADER];
    delete req.headers[CLIENT_IP_HEADER];
    const ip = req.ip || req.socket?.remoteAddress;
    if (ip) req.headers[CLIENT_IP_HEADER] = ip;
    handler(req, res).catch(next);
  });

  app.use(bodyParserByPath);
}
