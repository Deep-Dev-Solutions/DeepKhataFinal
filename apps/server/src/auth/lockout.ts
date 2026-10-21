import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export const MAX_FAILED_ATTEMPTS = 10;
/** Failed attempts (per account or per IP) after which sign-in also needs a captcha. */
export const CAPTCHA_AFTER_FAILURES = 3;
export const LOCKOUT_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours

export interface LockoutOutcome {
  status: 401 | 429;
  message: string;
}

export interface LoginIdentity {
  email?: string;
  username?: string;
}

export function formatRemainingTime(ms: number): string {
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

async function findLoginUser(db: PrismaClient, who: LoginIdentity) {
  if (who.email) {
    return db.user.findUnique({
      where: { email: who.email.toLowerCase().trim() },
      select: { id: true, lockoutUntil: true, failedAttempts: true },
    });
  }
  if (who.username) {
    return db.user.findUnique({
      where: { username: who.username.toLowerCase().trim() },
      select: { id: true, lockoutUntil: true, failedAttempts: true },
    });
  }
  return null;
}

/**
 * True once the target account or the calling IP has CAPTCHA_AFTER_FAILURES or
 * more failed sign-ins. The IP counter moves for unknown accounts too, so a
 * probe of made-up emails hits the captcha at the same point as a real one.
 */
export async function signInNeedsCaptcha(
  db: PrismaClient,
  ip: string,
  who: LoginIdentity,
): Promise<boolean> {
  if (ip) {
    const ipRecord = await db.loginAttempt.findUnique({ where: { ip } });
    if ((ipRecord?.attempts ?? 0) >= CAPTCHA_AFTER_FAILURES) return true;
  }
  const user = await findLoginUser(db, who);
  return (user?.failedAttempts ?? 0) >= CAPTCHA_AFTER_FAILURES;
}

/** Returns a 429 outcome when the IP or the account is currently locked. */
export async function checkLockout(
  db: PrismaClient,
  ip: string,
  who: LoginIdentity,
): Promise<LockoutOutcome | null> {
  const now = new Date();

  if (ip) {
    const ipRecord = await db.loginAttempt.findUnique({ where: { ip } });
    if (ipRecord?.lockoutUntil && ipRecord.lockoutUntil > now) {
      const remainingMs = ipRecord.lockoutUntil.getTime() - now.getTime();
      return {
        status: 429,
        message: `Too many failed login attempts from this IP address. Access has been restricted for security reasons. Please try again in ${formatRemainingTime(remainingMs)}.`,
      };
    }
  }

  const user = await findLoginUser(db, who);
  if (user?.lockoutUntil && user.lockoutUntil > now) {
    const remainingMs = user.lockoutUntil.getTime() - now.getTime();
    return {
      status: 429,
      message: `This account has been temporarily locked due to multiple failed login attempts. Please try again in ${formatRemainingTime(remainingMs)}.`,
    };
  }
  return null;
}

/** Counts a failed attempt against the IP and the account; always returns the error to raise. */
export async function recordFailedAttempt(
  db: PrismaClient,
  ip: string,
  who: LoginIdentity,
): Promise<LockoutOutcome> {
  const now = new Date();
  let maxAttemptsReached = false;
  let attemptsCount = 1;

  if (ip) {
    const existingIp = await db.loginAttempt.findUnique({ where: { ip } });
    const newAttempts = (existingIp?.attempts || 0) + 1;
    const isLocked = newAttempts >= MAX_FAILED_ATTEMPTS;
    const lockoutDate = isLocked
      ? new Date(now.getTime() + LOCKOUT_DURATION_MS)
      : null;

    await db.loginAttempt.upsert({
      where: { ip },
      create: { ip, attempts: newAttempts, lockoutUntil: lockoutDate },
      update: { attempts: newAttempts, lockoutUntil: lockoutDate },
    });

    if (isLocked) maxAttemptsReached = true;
    attemptsCount = Math.max(attemptsCount, newAttempts);
  }

  const user = await findLoginUser(db, who);
  if (user) {
    const newAttempts = user.failedAttempts + 1;
    const isLocked = newAttempts >= MAX_FAILED_ATTEMPTS;
    const lockoutDate = isLocked
      ? new Date(now.getTime() + LOCKOUT_DURATION_MS)
      : null;

    await db.user.update({
      where: { id: user.id },
      data: { failedAttempts: newAttempts, lockoutUntil: lockoutDate },
    });

    if (isLocked) maxAttemptsReached = true;
    attemptsCount = Math.max(attemptsCount, newAttempts);
  }

  if (maxAttemptsReached) {
    return {
      status: 429,
      message:
        'Security lockout triggered. Too many failed attempts (10/10). Access has been locked for 3 hours.',
    };
  }
  const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - attemptsCount);
  return {
    status: 401,
    message: `Invalid email or password. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before a 3-hour lockout.`,
  };
}

export async function resetFailedAttempts(
  db: PrismaClient,
  ip: string,
  who: LoginIdentity,
): Promise<void> {
  if (ip) {
    await db.loginAttempt.deleteMany({ where: { ip } }).catch(() => {});
  }
  const user = await findLoginUser(db, who);
  if (user) {
    await db.user
      .update({
        where: { id: user.id },
        data: { failedAttempts: 0, lockoutUntil: null },
      })
      .catch(() => {});
  }
}

/**
 * Users created by the legacy paths (invite accept, agency owner creation)
 * carry only User.password. Give them a Better Auth credential Account the
 * first time they sign in so they are not locked out.
 */
export async function ensureCredentialAccount(
  db: PrismaClient,
  who: LoginIdentity,
): Promise<void> {
  const user = who.email
    ? await db.user.findUnique({
        where: { email: who.email.toLowerCase().trim() },
        select: { id: true, password: true },
      })
    : who.username
      ? await db.user.findUnique({
          where: { username: who.username.toLowerCase().trim() },
          select: { id: true, password: true },
        })
      : null;
  if (!user || !user.password) return;

  const existing = await db.account.findFirst({
    where: { userId: user.id, providerId: 'credential' },
    select: { id: true },
  });
  if (existing) return;

  await db.account.create({
    data: {
      id: randomUUID(),
      accountId: user.id,
      providerId: 'credential',
      userId: user.id,
      password: user.password,
    },
  });
}
