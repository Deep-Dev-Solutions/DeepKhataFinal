import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { PrismaService } from './prisma/prisma.service.js';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Liveness probe — never touches the DB. */
  @Get('health')
  health(): Record<string, string> {
    return { status: 'ok' };
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
