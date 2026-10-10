import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaService } from './prisma/prisma.service.js';

describe('AppController', () => {
  let appController: AppController;
  let mockPrisma: { $queryRaw: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockPrisma = {
      $queryRaw: vi.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('should return status ok with db up when DB is reachable', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce(undefined);

      const response = await appController.health();

      expect(response.status).toBe('ok');
      expect(response.db).toBe('up');
      expect(typeof response.uptime).toBe('number');
      expect(typeof response.version).toBe('string');
    });

    it('should throw ServiceUnavailableException with status degraded when DB query fails', async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce(
        new Error('Connection refused'),
      );

      try {
        await appController.health();
        expect.fail('Should have thrown ServiceUnavailableException');
      } catch (err) {
        expect(err).toBeInstanceOf(ServiceUnavailableException);
        const response = (err as ServiceUnavailableException).getResponse();
        expect(response).toEqual(
          expect.objectContaining({
            status: 'degraded',
            db: 'down',
          }),
        );
        expect(response).toHaveProperty('uptime');
        expect(response).toHaveProperty('version');
        expect(response).not.toHaveProperty('error');
      }
    });

    it('should timeout and return degraded when DB query hangs', async () => {
      mockPrisma.$queryRaw.mockImplementationOnce(() => new Promise(() => {}));

      try {
        await appController.health();
        expect.fail('Should have thrown ServiceUnavailableException');
      } catch (err) {
        expect(err).toBeInstanceOf(ServiceUnavailableException);
        const response = (err as ServiceUnavailableException).getResponse();
        expect(response).toEqual(
          expect.objectContaining({
            status: 'degraded',
            db: 'down',
          }),
        );
        expect(response).toHaveProperty('uptime');
        expect(response).toHaveProperty('version');
      }
    });
  });
});
