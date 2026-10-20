import { beforeEach, describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthSessionsService } from '../auth/auth-sessions.service';
import { SubscriptionsService } from '../plans/subscriptions.service';
import { MailService } from '../mail/mail.service';
import { TenantCacheService } from '../tenant/tenant-cache.service';

describe('OnboardingService', () => {
  let service: OnboardingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: {} },
        { provide: AuthSessionsService, useValue: {} },
        { provide: TenantCacheService, useValue: {} },
        { provide: SubscriptionsService, useValue: {} },
        { provide: MailService, useValue: {} },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
