import type { INestApplication } from '@nestjs/common';
import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import {
  auth,
  CLIENT_IP_HEADER,
  REQUIRE_ROLE_HEADER,
} from './better-auth';

/**
 * Mounts Better Auth at /api/auth/* and then the JSON/urlencoded body parsers.
 * The handler must sit before body parsing (it reads the raw stream), so the
 * Nest app must be created with `bodyParser: false`. Call this before
 * `app.init()` and after `enableCors()`.
 */
export function mountAuth(app: INestApplication): void {
  const server = app.getHttpAdapter().getInstance();
  const handler = toNodeHandler(auth);

  server.all('/api/auth/*splat', (req: any, res: any, next: any) => {
    // Internal headers are ours alone: drop anything the client sent, then
    // pass the proxy-aware IP so lockouts and session rows see the real one.
    delete req.headers[REQUIRE_ROLE_HEADER];
    delete req.headers[CLIENT_IP_HEADER];
    const ip = req.ip || req.socket?.remoteAddress;
    if (ip) req.headers[CLIENT_IP_HEADER] = ip;
    handler(req, res).catch(next);
  });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
}
