import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { Role } from '@prisma/client';

const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours

function formatRemainingTime(ms: number): string {
  const totalMinutes = Math.ceil(ms / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} and ${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }
  return `${totalMinutes} minute${totalMinutes > 1 ? 's' : ''}`;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private async checkLockout(ip: string, email?: string) {
    const now = new Date();

    // 1. Check IP lockout
    if (ip) {
      const ipRecord = await this.prisma.loginAttempt.findUnique({
        where: { ip },
      });
      if (ipRecord?.lockoutUntil && ipRecord.lockoutUntil > now) {
        const remainingMs = ipRecord.lockoutUntil.getTime() - now.getTime();
        throw new HttpException(
          `Too many failed login attempts from this IP address. Access has been restricted for security reasons. Please try again in ${formatRemainingTime(remainingMs)}.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // 2. Check User email lockout
    if (email) {
      const user = await this.prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true, lockoutUntil: true, failedAttempts: true },
      });
      if (user?.lockoutUntil && user.lockoutUntil > now) {
        const remainingMs = user.lockoutUntil.getTime() - now.getTime();
        throw new HttpException(
          `This account has been temporarily locked due to multiple failed login attempts. Please try again in ${formatRemainingTime(remainingMs)}.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  private async recordFailedAttempt(ip: string, email?: string) {
    const now = new Date();
    let maxAttemptsReached = false;
    let attemptsCount = 1;

    // 1. Update IP attempt
    if (ip) {
      const existingIp = await this.prisma.loginAttempt.findUnique({
        where: { ip },
      });

      const newAttempts = (existingIp?.attempts || 0) + 1;
      const isLocked = newAttempts >= MAX_FAILED_ATTEMPTS;
      const lockoutDate = isLocked
        ? new Date(now.getTime() + LOCKOUT_DURATION_MS)
        : null;

      await this.prisma.loginAttempt.upsert({
        where: { ip },
        create: {
          ip,
          attempts: newAttempts,
          lockoutUntil: lockoutDate,
        },
        update: {
          attempts: newAttempts,
          lockoutUntil: lockoutDate,
        },
      });

      if (isLocked) maxAttemptsReached = true;
      attemptsCount = Math.max(attemptsCount, newAttempts);
    }

    // 2. Update User email attempt if user exists
    if (email) {
      const user = await this.prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true, failedAttempts: true },
      });

      if (user) {
        const newAttempts = user.failedAttempts + 1;
        const isLocked = newAttempts >= MAX_FAILED_ATTEMPTS;
        const lockoutDate = isLocked
          ? new Date(now.getTime() + LOCKOUT_DURATION_MS)
          : null;

        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            failedAttempts: newAttempts,
            lockoutUntil: lockoutDate,
          },
        });

        if (isLocked) maxAttemptsReached = true;
        attemptsCount = Math.max(attemptsCount, newAttempts);
      }
    }

    if (maxAttemptsReached) {
      throw new HttpException(
        `Security lockout triggered. Too many failed attempts (10/10). Access has been locked for 3 hours.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    } else {
      const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - attemptsCount);
      throw new UnauthorizedException(
        `Invalid email or password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before a 3-hour lockout.`,
      );
    }
  }

  private async resetFailedAttempts(ip: string, email?: string) {
    if (ip) {
      await this.prisma.loginAttempt
        .deleteMany({
          where: { ip },
        })
        .catch(() => {});
    }
    if (email) {
      await this.prisma.user
        .updateMany({
          where: { email: email.toLowerCase() },
          data: {
            failedAttempts: 0,
            lockoutUntil: null,
          },
        })
        .catch(() => {});
    }
  }

  async register(data: any) {
    const { name, email, password } = data;

    const existinguser = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existinguser) {
      throw new BadRequestException('Email Already Exist');
    }

    const hashPassword = await bcrypt.hash(password, 10);

    const NewUser = await this.prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        password: hashPassword,
      },
    });

    const accesstoken = this.jwtService.sign(
      {
        id: NewUser.id,
        name: NewUser.name,
        email: NewUser.email,
        role: NewUser.role,
        businessId: NewUser.businessId,
      },
      {
        secret: process.env.ACCESS_TOKEN_SECRET,
        expiresIn: (process.env.ACCESS_TOKEN_EXPIRATION || '1h') as any,
      },
    );

    return { user: NewUser, accessToken: accesstoken };
  }

  async login(data: any, res: Response, ip: string = '127.0.0.1') {
    const { email, password } = data;
    const normalizedEmail = email ? email.toLowerCase().trim() : '';

    await this.checkLockout(ip, normalizedEmail);

    const existinguser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { business: { select: { status: true } } },
    });

    if (!existinguser) {
      await this.recordFailedAttempt(ip, normalizedEmail);
      return;
    }

    const isFound = await bcrypt.compare(password, existinguser.password);
    if (!isFound) {
      await this.recordFailedAttempt(ip, normalizedEmail);
      return;
    }

    // Reset failed attempts upon successful login
    await this.resetFailedAttempts(ip, normalizedEmail);

    // Kill switch: suspended businesses cannot sign in at all.
    if (existinguser.business?.status === 'SUSPENDED') {
      throw new UnauthorizedException(
        'Account suspended. Contact DeepKhata administration.',
      );
    }

    const accesstoken = this.jwtService.sign(
      {
        id: existinguser.id,
        name: existinguser.name,
        email: existinguser.email,
        role: existinguser.role,
        businessId: existinguser.businessId,
      },
      {
        secret: process.env.ACCESS_TOKEN_SECRET,
        expiresIn: (process.env.ACCESS_TOKEN_EXPIRATION || '1h') as any,
      },
    );

    const refreshtoken = this.jwtService.sign(
      {
        id: existinguser.id,
      },
      {
        secret: process.env.REFRESH_TOKEN_SECRET,
        expiresIn: (process.env.REFRESH_TOKEN_EXPIRATION || '7d') as any,
      },
    );

    res.cookie('jwt', refreshtoken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });

    const { password: _, ...userWithoutPassword } = existinguser;

    return res.json({
      message: 'Login successful',
      accessToken: accesstoken,
      user: userWithoutPassword,
    });
  }

  async agencyLogin(data: any, res: Response, ip: string = '127.0.0.1') {
    const { email, password } = data;
    const normalizedEmail = email ? email.toLowerCase().trim() : '';

    await this.checkLockout(ip, normalizedEmail);

    const existinguser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!existinguser) {
      await this.recordFailedAttempt(ip, normalizedEmail);
      return;
    }

    const isFound = await bcrypt.compare(password, existinguser.password);
    if (!isFound) {
      await this.recordFailedAttempt(ip, normalizedEmail);
      return;
    }

    if (existinguser.role !== Role.SUPER_ADMIN) {
      // Record failed attempt to deter enumeration of user accounts against agency portal
      await this.recordFailedAttempt(ip, normalizedEmail);
      throw new ForbiddenException(
        'Access denied: This portal is strictly restricted to DeepKhata Super Admins.',
      );
    }

    // Reset failed attempts upon successful Super Admin authentication
    await this.resetFailedAttempts(ip, normalizedEmail);

    const accesstoken = this.jwtService.sign(
      {
        id: existinguser.id,
        name: existinguser.name,
        email: existinguser.email,
        role: existinguser.role,
        businessId: existinguser.businessId,
      },
      {
        secret: process.env.ACCESS_TOKEN_SECRET,
        expiresIn: (process.env.ACCESS_TOKEN_EXPIRATION || '1h') as any,
      },
    );

    const refreshtoken = this.jwtService.sign(
      {
        id: existinguser.id,
      },
      {
        secret: process.env.REFRESH_TOKEN_SECRET,
        expiresIn: (process.env.REFRESH_TOKEN_EXPIRATION || '7d') as any,
      },
    );

    res.cookie('jwt', refreshtoken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });

    const { password: _, ...userWithoutPassword } = existinguser;

    return res.json({
      message: 'Agency login successful',
      accessToken: accesstoken,
      user: userWithoutPassword,
    });
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        businessId: true,
        phone: true,
        avatarUrl: true,
        createdAt: true,
        business: {
          select: {
            id: true,
            status: true,
            subscriptionExpiresAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  logout(res: Response) {
    res.clearCookie('jwt');
    return res.json({ message: 'Logout successful' });
  }
}
