import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service';
import {
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';

describe('AuthService Lockout Protection', () => {
  let authService: AuthService;
  let mockPrisma: any;
  let mockJwt: any;

  beforeEach(() => {
    mockPrisma = {
      loginAttempt: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    mockJwt = {
      sign: vi.fn().mockReturnValue('mock-token'),
    };

    authService = new AuthService(mockPrisma, mockJwt);
  });

  it('should block login when IP is actively locked out', async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60); // 1 hr future
    mockPrisma.loginAttempt.findUnique.mockResolvedValue({
      ip: '192.168.1.100',
      attempts: 10,
      lockoutUntil: futureDate,
    });

    const res: any = { json: vi.fn(), cookie: vi.fn() };

    await expect(
      authService.login(
        { email: 'test@example.com', password: 'wrong' },
        res,
        '192.168.1.100',
      ),
    ).rejects.toThrow(HttpException);
  });

  it('should trigger lockout after 10 failed attempts', async () => {
    // Current attempts: 9
    mockPrisma.loginAttempt.findUnique.mockResolvedValue({
      ip: '192.168.1.100',
      attempts: 9,
      lockoutUntil: null,
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      password: 'hashedpassword',
      failedAttempts: 9,
      lockoutUntil: null,
    });

    const res: any = { json: vi.fn(), cookie: vi.fn() };

    try {
      await authService.login(
        { email: 'test@example.com', password: 'wrongpassword' },
        res,
        '192.168.1.100',
      );
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(err.message).toContain('Security lockout triggered');
      expect(err.message).toContain('10/10');
    }
  });

  it('should return remaining attempts on non-locking failure', async () => {
    mockPrisma.loginAttempt.findUnique.mockResolvedValue({
      ip: '192.168.1.100',
      attempts: 2,
      lockoutUntil: null,
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      password: 'hashedpassword',
      failedAttempts: 2,
      lockoutUntil: null,
    });

    const res: any = { json: vi.fn(), cookie: vi.fn() };

    try {
      await authService.login(
        { email: 'test@example.com', password: 'wrongpassword' },
        res,
        '192.168.1.100',
      );
    } catch (err: any) {
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(err.message).toContain('7 attempts remaining');
    }
  });
});
