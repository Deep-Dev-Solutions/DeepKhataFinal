import { beforeEach, describe, expect, it } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BusinessService } from './business.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('BusinessService', () => {
  let service: BusinessService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessService,
        { provide: PrismaService, useValue: {} },
        { provide: RedisService, useValue: {} },
      ],
    }).compile();

    service = module.get<BusinessService>(BusinessService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
