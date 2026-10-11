# Phase 6: Accounts, email and auth

**Goal:** real account management: revocable sessions, working email (invites, verification,
password reset), and staff logins that don't need an email address.

## Decisions

- **Auth library: Better Auth**, self-hosted on our Postgres via its Prisma adapter. Plugins: `admin` (ban, session revoke, impersonation for super admin), `username` (staff login without email). We keep our own `Business`, `Role` and `Invitation` models rather than the organization plugin. Revisit the organization plugin only if one owner needs several businesses.
- **Email provider: Resend** with our own domain (free tier: 3,000 emails/month, 100/day; Pro $20/mo for 50,000). Nodemailer stays as a fallback transport (SMTP) and Mailpit in dev.
- Shop staff often have no email. The owner can create staff with **username + password** directly and share the credentials on WhatsApp. Email invite is optional.

## Tasks

### A. Email service
1. `MailModule` with a `MailService.send(template, to, data)` interface and an `EmailLog` table (`to`, `template`, `status`, `providerId`, `error`, `createdAt`).
2. Templates built with `react-email` (or MJML), branded with `APP_NAME` and logo: verify email, password reset, staff invite, welcome, trial notices (used in Phase 7), invoice (Phase 7), notification digest (Phase 4 channel).
3. Retries: failed sends retried 3 times with backoff by a scheduled job; permanent failures visible to the super admin.
4. DNS doc in `deploy/EMAIL.md`: SPF, DKIM and DMARC records for the sending domain; test with mail-tester.
5. Wire Phase 4's `EMAIL` channel to `MailService`; the daily digest email lists today's lena and dena.

### B. Better Auth migration
1. Install `better-auth`, configure the Prisma adapter, and map to the existing `User` table (`modelName` and `fields` mapping) so user IDs and foreign keys stay unchanged. Add Better Auth's `session`, `account` and `verification` tables via a Prisma migration.
2. **Password migration without resets:** a migration script creates an `account` row (`providerId: 'credential'`) per user holding the existing bcrypt hash. Configure `emailAndPassword.password.hash/verify` to use bcrypt, so existing passwords keep working.
3. Mount the Better Auth handler at `/api/auth/*` on the Nest Express instance. Replace `JwtAuthGuard` with `SessionGuard` that calls `auth.api.getSession({ headers })` and loads `{ id, role, businessId }`. Enable the session cookie cache (5 min) to avoid a DB hit per request. Keep the kill-switch check and the Phase 2 `@Tenant()` decorator working on top.
4. Sessions: 30-day sliding sessions for counter PCs, revocable. On role change, removal or ban, revoke all of that user's sessions immediately.
5. Remove the old JWT login, refresh, cookie and token code, the `LoginAttempt`-based lockout (replace with Better Auth rate limiting plus our own lockout hook if needed), and all `ACCESS_TOKEN_*` env vars. The offline client must keep working: the session cookie is sent with sync requests; confirm the Dexie flush uses `credentials: 'include'` instead of a localStorage token.
6. Agency admin uses the same auth with role `SUPER_ADMIN`, plus the `admin` plugin for impersonation (Phase 8 uses it read-only).

### C. Account flows
1. **Owner signup:** name, email, phone, password → verify email (link valid 24 h) → onboarding (Phase 7 sets up the trial). Unverified owners can log in but see a banner, and can't invite staff until verified.
2. **Forgot password / reset** via email; owner can reset any staff password from Team settings.
3. **Staff creation, two ways:**
   - Invite by email: role + branch(es); link valid 72 h; resend and revoke; invite accepted → account created with that role and business.
   - Create directly: name, username (unique per business, stored as `username@<business-slug>` or with a business-scoped unique index), password, role, branch; show a "Share on WhatsApp" button with login URL and username.
4. **Branch assignment:** `UserBranch` join table; staff only see and act on their assigned branches; owner and manager can be set to all branches.
5. **Team page:** list users with role, branches, last active, active sessions; actions: change role, reset password, sign out all devices, deactivate. Plan limits from Phase 7 apply to user count.
6. **Profile:** change password, see own sessions, sign out others.

## Tests

- API: existing seeded passwords still log in after migration; role change revokes sessions (next request 401); deactivated user can't log in; invite token expiry, reuse and cross-tenant use all rejected; username uniqueness per business.
- E2E: signup → verification email in Mailpit → verify → onboarding. Forgot password → reset email → new password works. Owner creates staff with username → staff logs in on a second browser context → owner deactivates → staff kicked out on next action.
- P0 suite updated for the new login and still green.

## Acceptance criteria

- [ ] No custom JWT code remains; sessions are revocable.
- [ ] All seeded users log in with their old passwords after migration.
- [ ] Invite, verification, reset and digest emails deliver through Resend in staging (and Mailpit in dev), logged in `EmailLog`.
- [ ] Staff without email can be created and log in.
