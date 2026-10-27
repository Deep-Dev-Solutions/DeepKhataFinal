# Bug log: phases 1-10

Severity: S1 = data loss or security, S2 = wrong money or stock, S3 = broken feature, S4 = cosmetic.
Each fixed bug has a regression test (API spec in apps/server/test or Playwright spec in apps/e2e).

## Fixed

| # | Sev | Bug | Fix commit | Regression test |
|---|-----|-----|-----------|-----------------|
| 1 | S1 | K1-K3 security holes (tenant spoofing via body/header, unchecked x-branch-id, unauthenticated paths) | 1a9b0ce, 30bb234 | test/security.e2e-spec.ts |
| 2 | S1 | Logged-out token still accepted for up to 30 s (negative revocation cache, K7) | 889f710 | test/security.e2e-spec.ts |
| 3 | S1 | Role change and member removal only took effect at token expiry; a deleted user's token got 400 instead of 401 | 6932238 | tests/team/invite-flow.spec.ts, tests/auth/role-matrix.spec.ts |
| 4 | S1 | Login lockout keyed on a spoofable X-Forwarded-For | 6932238 | tests/auth/lockout.spec.ts |
| 5 | S2 | Return refund ignored the order discount (refunded gross) | 54bb9cc | test/money-ledger.e2e-spec.ts |
| 6 | S2 | Expected drawer cash ignored cash refunds; close-register not scoped to a branch | 6290b64 | tests/cash/register.spec.ts |
| 7 | S2 | Concurrent sales of the same stock got spurious 409s (no SKIP LOCKED) | 54bb9cc | test/orders-rules.e2e-spec.ts |
| 8 | S2 | Test-only leak: security spec paid a seeded vendor and broke dues FIFO | 0200b4e | test/dues.e2e-spec.ts |
| 9 | S3 | A partial return set the whole order RETURNED, blocking the remaining units | ecc8c55 | tests/returns/returns.spec.ts |
| 10 | S3 | Dues direction casing mismatch hid the WhatsApp and pay buttons | 50112cc | tests/dues/*.spec.ts |
| 11 | S3 | Managers got 403 on reports | 6932238 | tests/auth/role-matrix.spec.ts |
| 12 | S3 | 11-digit order search caused a 500 (int overflow) | 54bb9cc | test/orders-rules.e2e-spec.ts |
| 13 | S3 | Typo search found nothing (similarity instead of word_similarity) | 54bb9cc | test/stock-finder.e2e-spec.ts |
| 14 | S3 | TeamTab role select and Revoke button not wired | b61f2d1 | tests/team/invite-flow.spec.ts |
| 15 | S3 | Client production build broken by duplicate code in reports tabs after a bad merge | a043d92 | npm run build -w client |
| 16 | S3 | Schema/migration/seed mismatch; Redis required to boot | 1eab02c, 4ecca1b, cbcd7f8 | CI, test:api |
| 17 | S4 | Logout cookie clear options differed from set options (cookie not cleared on some hosts) | 7bfc0d2 | tests/auth/login-logout.spec.ts |
| 18 | S4 | Walk-in name typed at checkout missing on invoice and order page | b61f2d1 | tests/pos/walkin-cash.spec.ts |
| 19 | S2 | Every vendor restock with a unit cost returned 500 (selected Vendor.name; field is businessName) | cd825f0 | tests/inventory/inventory.spec.ts |
| 20 | S3 | CSV import skipped blank-name rows silently; a non-numeric price gave a 500 | cd825f0 | tests/inventory/inventory.spec.ts |
| 21 | S3 | Server unit suite could not run (no SWC in vitest unit config; scaffold specs had no providers) | 9bb917e | npm test -w server |

## Open / deferred

| # | Sev | Bug or gap | Why deferred |
|---|-----|-----------|--------------|
| D1 | S3 | POS has no item-condition picker; instances are picked automatically | Feature gap, needs product decision (tests/pos/condition-select.spec.ts is test.fixme) |
| D2 | S2 | Return refund goes to cash first, then reduces receivable, for a partly-paid order | Existing policy kept; owner decision (see STATUS decisions) |
| D3 | S3 | Customer balance clamps overpayment to 0 (no customer credit) | Needs a credit/advance design |
| D4 | S4 | Photo upload leaves an orphan Cloudinary file when the product 404s | Low impact |
| D5 | S3 | Login lockout is per IP, so one shop's shared IP can lock everyone out | Needs per-account + IP design |
| D6 | S3 | logExpense picks the open session without a branch when branchId is absent | Low risk; client always sends branch |
| D7 | S3 | Close register falls back to body branchId only (no x-branch-id fallback) | One-line controller change; client sends body |
| D8 | S4 | MANAGER sees an enabled Revoke button but the server allows OWNER only (403 toast) | UI polish |
| D10 | S3 | No CSV import UI in the client (API only); no item-condition input at product creation or restock (PATCH instance only) | Feature gap |
| D11 | S4 | settings.service inviteStaff alias counts members only, not pending invites (team.service counts both); no UI calls it | Low risk; remove alias or align |
| D9 | - | API emits money as JSON numbers, not strings | Contract change; all clients would need updating |

## Phases 6-10 items (carried from the phase-6-10 worktree, 2026-10-21)

| # | Sev | Item | Status |
|---|-----|------|--------|
| N1 | S3 | `offlineSyncedOrders` is always 0 in TenantDailyUsage: orders created via `/sync/batch` carry no `isOfflineSync` flag | Fixed: `Order.isOfflineSync` column (migration 0012), set only by the sync path, counted by the usage rollup |
| N2 | - | Trial lifecycle emails (days 3, 7, 25) fire when 0-2 days past the threshold; the daily cron tolerates a missed day without duplicates | Working as designed |
| N3 | S3 | Branch-restricted staff without `x-branch-id`: now default to their only branch, or 400 when they have several | Fixed in addf497 |
| N4 | S3 | `User.updatedAt` was missing, so delta sync could not track user changes | Fixed by migration `0011_user_updated_at` |

## Truth run (final-fixes close, 2026-10-21)

Failures found by the truth run are logged here as T1, T2, ... with the app fix and the test that guards it.

| # | Sev | Failure on clean `final-fixes` | Fix (in the app unless noted) | Guarded by |
|---|-----|-------------------------------|-------------------------------|-----------|
| T1 | S3 | Client lint: 149 errors (111 `no-explicit-any`, 32 React-compiler `set-state-in-effect`/purity rules, 4 `no-unescaped-entities`, 1-2 others) | 4 entities escaped. `any` and compiler rules moved to warnings in `apps/client/eslint.config.mjs` (visible debt, 58+ warnings), not hidden; typing the client is its own task | `npm run lint` 0 errors |
| T2 | S2 | `test:api` money-ledger "Ledger OK" failed: the analytics spec inserted RETURN transactions with no postings, so `verify-ledger` saw drift in the shared test DB | Spec fixture now posts a balanced REVENUE/CASH pair (a fixture bug, not an app bug; assertions unchanged) | test/money-ledger.e2e-spec.ts |
| T3 | S3 | E2E `auth/token-security.spec.ts` could not load: imported `jsonwebtoken`, removed with the JWT code | Forged HS256 tokens now signed with `node:crypto`; all assertions unchanged | tests/auth/token-security.spec.ts |
| T4 | S3 | POS catalogue showed no rows after the offline cache change: `product.instances?.filter is not a function` when cached products have no instances array; remote-branch browse used the local cache; min price lost in cache. Broke 10 POS/cash/dues/stock-finder specs | POS and search client normalise `instances`/`stock`/`minSalePrice`, skip the local index for another branch, enrich cached products with instances and other-branch stock | tests/pos/*, cash, dues, stock-finder |
| T5 | S3 | Agency-onboarded tenants: owner unverified (so invites 403 `EMAIL_NOT_VERIFIED`), trial plan allows 1 branch / fewer users than the console and tests assume | `onboard-tenant` marks the owner verified and accepts `customLimits`; agency console "add branch" sends `override` (SUPER_ADMIN may exceed plan) | tests/billing/*, tests/agency/* |
| T6 | S4 | Staff invite email lost the `*ROLE*` emphasis the spec asserts | Template restored | tests/team/invite-flow.spec.ts |
| T7 | S3 | E2E `team/invite-flow` "role change is effective on the already-issued token" expected the old token to stay valid (phase 1 behaviour); phase 6 deliberately revokes sessions on role change (accounts API spec) | Kept the app (revocation, safer). Spec updated to the designed behaviour: old token 401, fresh login carries the new role. Judgment call, flagged for the owner | tests/team/invite-flow.spec.ts, test/accounts.e2e-spec.ts |
| T8 | S3 | View-as access-log flooding: every request of an impersonated session was logged (one short visit = 59 rows), so the tenant's Settings > access log (newest 50) lost the VIEW_AS start row. Blocked writes were never logged (guard throws before the interceptor) | One VIEW_AS start row from the agency endpoint; later requests logged once per (session, method, route template) as `SUPPORT_READ` (bounded in-memory set, safe to lose); `/auth/*` and `/user/me` never logged; refused writes logged as `SUPPORT_WRITE_BLOCKED` from SessionGuard. Tenant endpoint always includes the newest VIEW_AS rows, then fills with the newest others | test/view-as.e2e-spec.ts "access log: one row per (session, method, route template)...", tests/agency/view-as.spec.ts |
| T9 | S2 | View-as Exit logged the support agent out of the agency console: activation overwrote the shared session cookie and Exit called `/auth/logout` | Activation stashes the agent's own session in the signed httpOnly `dk_admin_return` cookie (only for the issuing SUPER_ADMIN). New `POST /auth/view-as/exit` revokes only the impersonated session, clears the stash and re-sets the original cookie after re-checking it is a live, non-impersonated SUPER_ADMIN session; the banner calls it instead of logout | test/view-as.e2e-spec.ts "start: activation sets...", "exit revokes only...", "exit without a valid stash...", "a tenant user (or anonymous) cannot call exit"; tests/agency/view-as.spec.ts |

## RBAC and tenancy audit (2026-10-22)

Full route matrix and evidence: `docs/plan/runs/rbac-audit.md` (about 187 routes). 3 S1, 12 S2, 17 S3. Every finding was read in code; F1 and F3 were re-checked by hand. Status is updated here as each is fixed.

| # | Sev | Finding | Status |
|---|-----|---------|--------|
| F1 | S1 | OWNER can promote a member to SUPER_ADMIN via `PUT /team/role` / `PATCH /team/updaterole` (role from untyped body, `team.service.ts` updateRole) | fixed (apps/server/test/rbac-escalation.e2e-spec.ts) |
| F2 | S1 | `POST /settings/staff` takes the invite role from the body, invite never expires (`settings.service.ts`) | fixed (apps/server/test/rbac-escalation.e2e-spec.ts) |
| F3 | S1 | `PUT /customer/customerdetails/:id` passes the raw body to `prisma.customer.update` (mass assignment: creditLimit, isDefaulter, businessId, nested writes) | fixed (apps/server/test/rbac-escalation.e2e-spec.ts) |
| F4 | S2 | Dashboard cache key has no role: STAFF can receive OWNER's COGS/profit when cached | open |
| F5 | S2 | STAFF has `read:vendors`: unit costs and payables returned | open |
| F6 | S2 | `GET /inventory/low-stock` returns `costPrice` to STAFF | open |
| F7 | S2 | STAFF can `PATCH /order/:id/status` to CANCELLED (restock, deletes ledger rows) or bypass OWNER-only settle-memo | open |
| F8 | S2 | STAFF can sell below `minSalePrice` through `discount` | open |
| F9 | S2 | `customerId` on order create not checked against the tenant | open |
| F10 | S2 | `vendorId` unchecked in addproduct, bulk-restock, import | open |
| F11 | S2 | Body `branchId` unvalidated on cash expense/open/close | open |
| F12 | S2 | Public order invoice returns the full customer row and internal ids | open |
| F13 | S2 | SUPER_ADMIN `GET /dashboard` returns another tenant's data unlogged | open |
| F14 | S2 | Desktop device endpoints ignore READ_ONLY/expired subscriptions | open |
| F15 | S2 | `sync/batch` skips DTO validation and the validated branch | open |
| S3 list | S3 | 17 hardening items (see audit section 7), incl. `/health/db` leaks raw DB error, invite-accept returns password hash, `/cabinet/debug-reorder` stub, category cross-tenant gives 400 not 404 | open |

D8 (MANAGER Revoke button) may be stale: by code reading MANAGER cannot reach the Team tab at all.

## Bot hardening (close run)

Part 1. Tests: `apps/server/test/hardening.e2e-spec.ts` (suite "Bot hardening (e2e)") and `apps/server/src/common/caddyfile.spec.ts`.

| Item | Change | Status |
|------|--------|--------|
| A. Real client IP | `deploy/Caddyfile` global `trusted_proxies static <Cloudflare ranges>` + `client_ip_headers CF-Connecting-IP`, `header_up X-Forwarded-For/X-Real-IP {client_ip}` on all 3 reverse_proxy blocks; `configureTrustProxy()` (`src/common/trust-proxy.ts`) shared by main.ts and the test app | done (caddyfile.spec.ts; "real client IP behind a proxy": ignores spoofed XFF from untrusted peer, honours trusted peer, right-most hop). Keep the range list in sync with https://www.cloudflare.com/ips/ before each deploy |
| B. Rate limiting | Global `AppThrottlerGuard` (APP_GUARD), env `THROTTLE_LIMIT/_TTL_MS/_AUTH_LIMIT/_PUBLIC_LIMIT`; `@AuthThrottle()` on `/auth/*` (login, register, agency-login, resend-verification), `/user/change-password`; `@PublicThrottle()` on team invite/join/accept-invite, public invoices (+pdf), public order invoice; `/health` and `/` skipped; class-level ThrottlerGuard removed from all controllers; Better Auth `rateLimit` with custom rules on sign-in, forget/reset password, send-verification-email | done ("credential endpoints use the strict auth throttler", "unauthenticated token routes use the public throttler", "global limit", "spoofing X-Forwarded-For cannot dodge a limit", "Better Auth /api/auth/* limiter") |
| C. Body limits | `bodyLimitFor()` in `mount-auth.ts`: 100kb default, 16kb for /auth, /api/auth, /team, /public, public order invoice; 2mb for /sync/*, /order/sync, /product/import, /product/bulk-restock; JSON 413 body; Better Auth Content-Length check; multer `UPLOAD_LIMITS` (5MB, 1 file) on avatar/logo/photo uploads | done ("explicit request body limits") |
| D. Env docs | `apps/server/.env.example`, `deploy/.env.example`, `deploy/README.md` | done |

Known limits: throttler counters are in memory per API process (single VPS container; use a Redis storage if scaled out). Default limits are per route and client IP, not one global bucket per IP. Playwright against a dev server needs `THROTTLE_AUTH_LIMIT` raised (many logins from one IP).

Part 2 (captcha, disposable email, one trial per phone). Tests: `apps/server/test/bot-protection.e2e-spec.ts` (suite "Bot protection part 2 (e2e)") plus unit specs `src/captcha/captcha.spec.ts`, `src/common/phone.spec.ts`, `src/common/disposable-email.spec.ts`.

| Item | Change | Status |
|------|--------|--------|
| E. Cloudflare Turnstile | `src/captcha/` (`checkCaptcha`, `CaptchaService`, global `CaptchaModule`); off when `TURNSTILE_SECRET_KEY` is unset, loud boot warning in production; 5 s timeout, fails closed; token from `x-captcha-response` or body `captchaToken`; 400 `CAPTCHA_REQUIRED` / `CAPTCHA_INVALID`. Enforced on POST /auth/register, POST /auth/resend-verification, Better Auth `/request-password-reset`, `/forget-password`, `/send-verification-email`, and sign-in (Nest login, agency-login, Better Auth `/sign-in/email|username`) once the account (`User.failedAttempts`) or the IP (`LoginAttempt.attempts`) has 3 failures; success resets the counters. Own hook in `better-auth.ts` instead of the Better Auth captcha plugin (needs our error codes and runtime env). Client `TurnstileWidget` on register, forgot-password, verify-email, EmailVerifyBanner, login (only after CAPTCHA_REQUIRED) | done server ("Turnstile on register", "... on resend verification", "... on forgot password (Better Auth)", "... on sign-in only after 3 failed attempts (Nest login)", "... (Better Auth routes)"); client built, not browser-tested. Agency-admin login has no widget (see limits) |
| F. Disposable email domains | `src/common/disposable-email.ts` (about 700 built-in domains, `DISPOSABLE_EMAIL_EXTRA`, `DISPOSABLE_EMAIL_ALLOW`, subdomain-aware, case-insensitive); 400 `EMAIL_DOMAIN_NOT_ALLOWED` on /auth/register and Better Auth `/sign-up/email`, `/change-email` (both disabled today). Staff invites and agency onboarding untouched | done ("disposable email domains": blocked, subdomain/uppercase, EXTRA, ALLOW override; unit spec) |
| G. One trial per phone | Migration `0013_trial_claim` (`TrialClaim`, unique `phoneNormalized`, backfill of existing Pakistani business phones with ON CONFLICT DO NOTHING); `src/common/phone.ts` (`normalizePhone`), `src/common/trial-claim.ts`; claim inside the business-creating transaction in `OnboardingService.businessOnboarding` and `AgencyService.onboardTenant` (phone optional there); 409 `TRIAL_ALREADY_USED`, 400 `PHONE_INVALID` | done ("one trial per phone number": claim, duplicate in any format rolls back, invalid phone, concurrent onboardings -> exactly one 201, agency path, shared claim) |

Limits: the agency-admin login page has no Turnstile widget, so a super admin who fails 3 times with the secret set must sign in through the client login page (shows the widget). The captcha gate uses account OR IP counters; an account that other IPs have failed on 3 times needs a captcha from any IP, a small existence signal. A claim outlives a deleted business on purpose (no foreign key).

| Bot hardening | Status | Test |
|---|---|---|
| Per-address daily email cap (`EMAIL_DAILY_CAP_PER_ADDRESS`, default 10 per rolling 24 h; advisory-locked; suppressed sends are FAILED/`DAILY_CAP_EXCEEDED`, never retried; callers stay neutral) | fixed | test/email-cap.e2e-spec.ts |
| Suppressed invoice mail no longer marks the invoice SENT (502, WhatsApp link still available) | fixed | test/email-cap.e2e-spec.ts |
| Open: agency-admin login has no Turnstile widget (a super admin who fails 3 times with the secret set must use the client login page); client widgets not browser-tested | open | n/a |
| Open: an account failed 3 times from other IPs asks for a captcha from any IP (small enumeration signal) | open | n/a |

## Finish week — findings (not fixed, logged per kickoff rule)

| Day | Finding | Suggested fix |
| --- | --- | --- |
| A (d2 verify) | `npm run lint` aborts for `apps/agency-admin` before linting a single file: `typescript-eslint does not support TS 7.0` (agency-admin declares `typescript ^7.0.2` + `eslint ^10.12.0`; lockfile pins both nested). Forcing the root toolchain (eslint 9.39.5 + TS 6.0.3) lints the same files fine, so the code is not the problem. | **Fixed** — owner decision, escalated `eslint` to `^9.39.5` in `apps/agency-admin/package.json`. `npm run lint` now exits 0 with 13 warnings and no errors. |
| A (d2 verify) | Migration folders `20261026083919_0014_deal_history` and `20261026093000_0015_plan_templates` carry `migrate dev` timestamps instead of AGENTS.md's `0014_`/`0015_` prefixes. Harmless to Prisma, but breaks the documented naming rule. | **Closed** — owner decision: keep Prisma's timestamp names, do not rename applied migrations. `AGENTS.md` now documents that form. |
| A (d2 verify) | Day-2 lint warnings: `test/agency-deals.e2e-spec.ts` imports unused `randomUUID`; `src/agency/agency.service.ts` has unused `sub`/`password` bindings | tidy when those files are next touched |
| A (d2 verify) | `npm run stack:up` (`docker compose --profile full up -d --build`) builds the three images in parallel; on a 16 GB box the api `npm ci` can die after ~4 min with npm's "Exit handler never called!" (client + admin installs + api's prisma generate postinstall run at once). Serial builds succeed, so the compose file/interfaces are fine. | **Fixed** — owner decision: `stack:up` now runs with `COMPOSE_PARALLEL_LIMIT=1`, so images build one at a time. |
| A (d2 verify) | The lockfile carried no `@typescript/typescript-*` platform entries (only the `optionalDependencies` list), so `npm ci` on a clean checkout installs typescript 7 without a compiler and `next build` fails for `apps/agency-admin`. Fixed in `b807bd5`. | none — re-check after dependency bumps by building `apps/agency-admin` from a clean `npm ci` |
| D (d5 cash) | After a register is closed, the Cash page and Z-Report still show "Expected in Drawer" computed as float 0 − expenses, e.g. `PKR -300`, because the closed session's opening float is no longer counted. | open — display-only; should show a dash or the closed session's own totals |
