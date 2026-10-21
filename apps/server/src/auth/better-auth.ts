import * as dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api';
import { admin, bearer, username } from 'better-auth/plugins';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';
import { getCorsOrigins } from '../config/cors';
import { sendResetPasswordMail, sendVerificationMail } from './auth-mail';
import { authDb, authDbProxy } from './auth-db';
import {
  checkLockout,
  ensureCredentialAccount,
  recordFailedAttempt,
  resetFailedAttempts,
  signInNeedsCaptcha,
  type LoginIdentity,
} from './lockout';
import {
  CAPTCHA_HEADER,
  CAPTCHA_MESSAGES,
  captchaEnabled,
  checkCaptcha,
} from '../captcha/captcha';
import {
  EMAIL_DOMAIN_NOT_ALLOWED,
  isDisposableEmail,
} from '../common/disposable-email';

// better-auth.ts is imported before main.ts runs dotenv.config().
dotenv.config();

const MIN_SECRET_LENGTH = 32;

/** Internal headers set by this server only (never trusted from the network). */
export const CLIENT_IP_HEADER = 'x-dk-client-ip';
export const REQUIRE_ROLE_HEADER = 'x-dk-require-role';

export function assertAuthSecret(): void {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value || value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `BETTER_AUTH_SECRET must be set and at least ${MIN_SECRET_LENGTH} characters`,
    );
  }
}

/** Staff usernames look like "<handle>@<business-slug>" (stored lowercase). */
const USERNAME_PATTERN = /^[a-z0-9._-]{1,40}@[a-z0-9-]{1,60}$/i;

const SIGN_IN_PATHS = new Set(['/sign-in/email', '/sign-in/username']);

function identityFromBody(body: any): LoginIdentity {
  const email = typeof body?.email === 'string' ? body.email : undefined;
  const user = typeof body?.username === 'string' ? body.username : undefined;
  return email ? { email } : { username: user };
}

function headerOf(ctx: any, name: string): string | undefined {
  return (
    ctx.headers?.get?.(name) ?? ctx.request?.headers?.get?.(name) ?? undefined
  );
}

/** Better Auth endpoints that always need a captcha (when TURNSTILE_SECRET_KEY is set). */
const CAPTCHA_PATHS = new Set([
  '/request-password-reset',
  '/forget-password',
  '/send-verification-email',
]);
/** Self-service address changes / sign-ups: no disposable-mail domains. */
const EMAIL_CHECK_PATHS = new Set(['/sign-up/email', '/change-email']);

/** Throws 400 { code, message } when the request has no (valid) captcha token. */
async function requireCaptcha(ctx: any, ip: string): Promise<void> {
  const code = await checkCaptcha(headerOf(ctx, CAPTCHA_HEADER), ip || undefined);
  if (code) {
    throw new APIError('BAD_REQUEST', { code, message: CAPTCHA_MESSAGES[code] });
  }
}

function raise(status: 401 | 429, message: string): never {
  throw new APIError(status === 429 ? 'TOO_MANY_REQUESTS' : 'UNAUTHORIZED', {
    message,
  });
}

/**
 * Lockout policy on the sign-in paths: 10 failures per IP and per account
 * lock both for 3 hours, even when the right password is supplied later.
 */
const lockoutBefore = createAuthMiddleware(async (ctx) => {
  const ip = headerOf(ctx, CLIENT_IP_HEADER) ?? '';
  if (CAPTCHA_PATHS.has(ctx.path)) {
    await requireCaptcha(ctx, ip);
    return;
  }
  if (EMAIL_CHECK_PATHS.has(ctx.path)) {
    const email = (ctx.body as any)?.email ?? (ctx.body as any)?.newEmail;
    if (typeof email === 'string' && isDisposableEmail(email)) {
      throw new APIError('BAD_REQUEST', {
        code: EMAIL_DOMAIN_NOT_ALLOWED,
        message:
          'Temporary or disposable email addresses are not accepted. Please use your own email address.',
      });
    }
    return;
  }
  if (!SIGN_IN_PATHS.has(ctx.path)) return;
  const who = identityFromBody(ctx.body);
  const db = authDb();
  const locked = await checkLockout(db, ip, who);
  if (locked) raise(locked.status, locked.message);
  // After 3 failed attempts even the right password needs a captcha.
  if (captchaEnabled() && (await signInNeedsCaptcha(db, ip, who))) {
    await requireCaptcha(ctx, ip);
  }
  await ensureCredentialAccount(authDb(), who);
});

const lockoutAfter = createAuthMiddleware(async (ctx) => {
  if (!SIGN_IN_PATHS.has(ctx.path)) return;
  const db = authDb();
  const ip = headerOf(ctx, CLIENT_IP_HEADER) ?? '';
  const who = identityFromBody(ctx.body);
  const returned: any = ctx.context.returned;

  if (isAPIError(returned)) {
    if (returned.statusCode === 401) {
      const outcome = await recordFailedAttempt(db, ip, who);
      raise(outcome.status, outcome.message);
    }
    return;
  }

  const sessionToken: string | undefined = returned?.token;
  const userId: string | undefined = returned?.user?.id;
  if (!sessionToken || !userId) return;

  const requiredRole = headerOf(ctx, REQUIRE_ROLE_HEADER);
  if (requiredRole) {
    const row = await db.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (row?.role !== requiredRole) {
      // Do not reveal which accounts exist on the agency portal.
      await ctx.context.internalAdapter.deleteSession(sessionToken);
      const outcome = await recordFailedAttempt(db, ip, who);
      raise(outcome.status, outcome.message);
    }
  }

  // Deactivated or banned members cannot open a session, even with the right password.
  const standing = await db.user.findUnique({
    where: { id: userId },
    select: { deactivatedAt: true, banned: true, banExpires: true },
  });
  const bannedNow =
    !!standing?.banned && (!standing.banExpires || standing.banExpires > new Date());
  if (standing?.deactivatedAt || bannedNow) {
    await ctx.context.internalAdapter.deleteSession(sessionToken);
    raise(401, 'Account deactivated. Contact your shop owner.');
  }

  await resetFailedAttempts(db, ip, who);

  // Kill switch: suspended businesses cannot sign in at all.
  const row = await db.user.findUnique({
    where: { id: userId },
    select: { business: { select: { status: true } } },
  });
  if (row?.business?.status === 'SUSPENDED') {
    await ctx.context.internalAdapter.deleteSession(sessionToken);
    raise(401, 'Account suspended. Contact DeepKhata administration.');
  }
});

const baseURL =
  process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || 5000}`;
const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
const isProduction = process.env.NODE_ENV === 'production';

function intEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * Better Auth's own /api/auth/* endpoints bypass Nest guards, so they carry
 * their own limiter (in memory, per client IP and path). The client IP comes
 * from CLIENT_IP_HEADER, which mountAuth fills with the proxy-aware req.ip.
 * Off under NODE_ENV=test unless THROTTLE_FORCE=1 (the API suite shares one IP).
 */
const signInMax = intEnv('THROTTLE_AUTH_LIMIT', 10);
const recoveryMax = Math.max(1, Math.floor(signInMax / 2));
const signInRule = { window: 60, max: signInMax };
const recoveryRule = { window: 60, max: recoveryMax };
const rateLimit = {
  enabled: process.env.NODE_ENV !== 'test' || process.env.THROTTLE_FORCE === '1',
  window: 60,
  max: intEnv('THROTTLE_LIMIT', 100),
  customRules: {
    '/sign-in/email': signInRule,
    '/sign-in/username': signInRule,
    '/forget-password': recoveryRule,
    '/request-password-reset': recoveryRule,
    '/reset-password': recoveryRule,
    '/send-verification-email': recoveryRule,
  },
};

export const auth = betterAuth({
  appName: process.env.APP_NAME || 'DeepKhata',
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: getCorsOrigins(),
  database: prismaAdapter(authDbProxy, { provider: 'postgresql' }),
  rateLimit,
  emailAndPassword: {
    enabled: true,
    // Accounts are created server-side (register, invite, onboarding, agency).
    disableSignUp: true,
    // Unverified owners may log in; only team creation is gated (TeamService).
    requireEmailVerification: false,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, token }: { user: { email?: string; name: string }; token: string }) => {
      await sendResetPasswordMail(user, token);
    },
    password: {
      hash: (password: string) => bcrypt.hash(password, 10),
      verify: ({ hash, password }: { hash: string; password: string }) =>
        bcrypt.compare(password, hash),
    },
  },
  emailVerification: {
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, token }: { user: { email?: string; name: string }; token: string }) => {
      await sendVerificationMail(user, token);
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    additionalFields: {
      activeBranchId: { type: 'string', required: false, input: false },
    },
  },
  user: {
    additionalFields: {
      businessId: { type: 'string', required: false, input: false },
      phone: { type: 'string', required: false },
    },
  },
  advanced: {
    database: { generateId: () => randomUUID() },
    ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    // Session cookie is read by the Next middlewares (existence check only).
    useSecureCookies: isProduction,
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
    },
    ...(cookieDomain
      ? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } }
      : {}),
  },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 120,
      usernameValidator: (value: string) => USERNAME_PATTERN.test(value),
    }),
    admin({
      roles: {
        SUPER_ADMIN: adminAc,
        OWNER: userAc,
        MANAGER: userAc,
        STAFF: userAc,
      },
      adminRoles: ['SUPER_ADMIN'],
      defaultRole: 'OWNER',
      allowImpersonatingAdmins: false,
    }),
    bearer(),
  ],
  hooks: { before: lockoutBefore, after: lockoutAfter },
});
