import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppService } from './app.service.js';
import { PrismaService } from './prisma/prisma.service.js';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  version: string;
  uptime: number;
}

const HEALTH_TIMEOUT_MS = 2000;

@Controller()
export class AppController {
  private logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async health(): Promise<HealthResponse> {
    const version =
      process.env.APP_VERSION ?? process.env.npm_package_version ?? 'dev';
    const uptime = Math.round(process.uptime());

    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Health check timeout')),
            HEALTH_TIMEOUT_MS,
          );
        }),
      ]);

      return {
        status: 'ok',
        db: 'up',
        version,
        uptime,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Health check failed: ${message}`);
      throw new ServiceUnavailableException({
        status: 'degraded',
        db: 'down',
        version,
        uptime,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Readiness probe — runs a minimal DB round-trip. */
  @Get('health/db')
  async healthDb(): Promise<Record<string, string>> {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return { status: 'ok', db: 'reachable' };
    } catch (err: any) {
      // Return 200 with the error detail so the caller can see exactly what's wrong
      // without triggering Vercel's FUNCTION_INVOCATION_FAILED path.
      return {
        status: 'degraded',
        db: 'unreachable',
        error: err?.message ?? String(err),
      };
    }
  }
}
