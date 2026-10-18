import { beforeEach, describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TeamService } from './team.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthSessionsService } from '../auth/auth-sessions.service';
import { RedisService } from '../redis/redis.service';
import { TenantCacheService } from '../tenant/tenant-cache.service';
import { PlanLimitsService } from '../plans/plan-limits.service';

describe('TeamService', () => {
  let service: TeamService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamService,
        { provide: PrismaService, useValue: {} },
        { provide: AuthSessionsService, useValue: {} },
        { provide: RedisService, useValue: {} },
        { provide: TenantCacheService, useValue: {} },
        { provide: PlanLimitsService, useValue: {} },
      ],
    }).compile();

    service = module.get<TeamService>(TeamService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
