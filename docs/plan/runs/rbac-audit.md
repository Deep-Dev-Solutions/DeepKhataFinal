# RBAC and tenancy audit (read-only code review)

Scope: `apps/server/src` (NestJS), plus client and agency-admin gating and the existing tests.
Method: every controller and the service behind each `:id` route was read. Nothing was run
(no server, tests, docker or builds), so every finding below is "verified in code" unless it is
marked **unverified**. Date: 2026-10-21. Branch: `hardening-close`.

Legend. Roles: **O** OWNER, **M** MANAGER, **S** STAFF, **SA** SUPER_ADMIN. Guards: **T** ThrottlerGuard,
**SG** SessionGuard, **PG** PermissionsGuard, **RG** RolesGuard. "uid->db" means the service takes
`req.user.id` (from the session) and re-reads `user.businessId` from the database, which is session-derived and
safe. "@Tenant" means `req.tenant` set by SessionGuard. SA passes every PermissionsGuard check (it holds all
permissions) but has no `businessId`, so tenant routes answer 400/403 for SA unless noted (F13).

---

## 0. How the guards actually work

* `SessionGuard` (`auth/guards/session.guard.ts`) is **not global** (no `APP_GUARD`; only `APP_INTERCEPTOR` for the
  access log). Every controller must opt in. All do except the public routes listed in section 3.
* Role, `businessId`, ban and deactivation come from the database (30 s per-process cache, `tenant-cache.service.ts:25`),
  not from the session token. Role change, removal and deactivation call `revokeAllForUser`
  (`auth-sessions.service.ts:26`) which also clears this process's cache. Other API instances (Vercel) can lag up to 30 s.
* View-as (impersonated) sessions are blocked for non-GET at `session.guard.ts:76-82`. Only requests that pass
  SessionGuard are covered (see S3-8).
* SA returns at `session.guard.ts:85` before the kill switch, branch checks and `req.tenant`. `@Tenant()` then throws 403.
* `x-branch-id` is validated only for users with a business (`session.guard.ts:133-136`); restricted members
  (`UserBranch`) are checked at `:141-157`. The `@BranchId()` decorator re-reads the raw header; it is safe only
  because SessionGuard ran first. **Branch ids in request bodies are not covered** (F11, F15, S3-1).
* `ValidationPipe({whitelist:true})` only applies to typed DTO classes. Every `@Body() body: any` is passed through
  untouched (root cause of F1, F2, F3).

---

## 1. Route matrix

### 1.1 Permission matrix as implemented (`config/permissions.ts`)

| Permission | O | M | S | SA | Server routes using it |
|---|---|---|---|---|---|
| read:products | y | y | y | y | product GETs, category/cabinet GET, inventory GETs |
| write:products | y | y | - | y | product/category/cabinet writes, inventory/restock, import, bulk-restock, move-stock |
| delete:products | y | - | - | y | DELETE /product/:id (also needs RG O/SA) |
| create:order | y | y | y | y | POST order/neworder; sync CREATE_ORDER |
| read:orders | y | y | y | y | order GETs |
| update:order | y | y | y | y | order status, recordpayment, settle-memo (RG O), return (RG O/M); sync RECORD_PAYMENT |
| read:customers | y | y | y | y | customer GETs |
| write:customers | y | y | y | y | newcustomer, customerdetails; sync UPSERT_CUSTOMER |
| manage:risk | y | y | - | y | customerrisk |
| read:reports | y | y | - | y | /reports/* |
| manage:team | y | - | - | y | /team/*, /team/members/* |
| manage:business | y | - | - | y | **not used by any server route** (client only) |
| manage:cash / read:cash | y | y | y | y | /cash/* (STAFF included) |
| read:vendors | y | y | y | y | GET /vendors, /vendors/:id (STAFF included) |
| manage:vendors | y | y | - | y | vendor create/purchase/payment |
| read:dues / manage:dues | y | y | - | y | /dues, /khata-entries (read, create, update, settle, promote) |
| write-off:dues | y | - | - | y | khata write-off |
| read:stock-finder | y | y | y | y | /stock/find, GET reservations and transfers |
| manage:reservations | y | y | y | y | reservations create/release |
| request:transfers | y | y | y | y | transfer create/cancel |
| manage:transfers | y | y | - | y | transfer dispatch/receive |
| read:notifications | y | y | y | y | notifications, GET notification-settings |
| manage:notification-settings | y | y | - | y | PUT notification-settings |

Client copy (`apps/client/src/hooks/usePermissions.ts`) matches except it has no `manage:cash`/`read:cash` at all (nothing in the client gates on them).

### 1.2 Routes by controller

"Pass" is the set of roles that get through all guards. "Biz" = where `businessId` comes from. "id scope" = how `:id` is
scoped in the service query (read in the service, not only the controller).

**AppController** (no guards)
| Route | Guards | Needs | Pass | Biz | id scope |
|---|---|---|---|---|---|
| GET / | none | - | public | n/a | n/a |
| GET /health | none | - | public | n/a | n/a |
| GET /health/db | none | - | public (returns raw DB error text, S3-2) | n/a | n/a |

**AuthController** (`/auth`, class T) and **ViewAsController** (`/auth`)
| Route | Guards | Pass | Notes |
|---|---|---|---|
| POST /auth/register | T | public | duplicate email answers "Email Already Exist" (enumeration, S3-9) |
| POST /auth/login | T | public | lockout in Better Auth hooks |
| POST /auth/agency-login | T | public | sets `x-dk-require-role: SUPER_ADMIN` server-side; header stripped from network input (`mount-auth.ts:26`) |
| POST /auth/resend-verification | T, SG | any session (also business-less) | uses `req.user.id` |
| POST /auth/logout | T, SG | any session | allowed in read-only and view-as |
| POST /auth/view-as/activate | T (10/min) | public, bearer = impersonation session token | only sessions with `impersonatedBy` and unexpired are accepted |
| GET /auth/session-info | SG | any session | |

**UserController / UserAccountController / BusinessController** (SG only)
| Route | Pass | Notes |
|---|---|---|
| GET /user/me | any | |
| GET /user/sessions | any | own sessions only (`where userId`) |
| POST /user/sessions/revoke-others | any | own only |
| POST /user/change-password | any | no Throttler, no attempt lockout (S3-3) |
| GET /businessinfo | tenant users (uid->db) | |

**Better Auth, mounted outside Nest** `/api/auth/*` (`mount-auth.ts`): sign-up disabled; `role` and `businessId` are `input:false`
(verified in `better-auth/dist/plugins/admin/schema.mjs`); admin plugin endpoints require role SUPER_ADMIN. These routes do not run SessionGuard
(see S3-8).

**OnboardingController** (`/onboard`, T, SG)
| Route | Extra | Pass | Biz |
|---|---|---|---|
| POST /onboard/onboarding | AllowWithoutBusiness | any user without a business (409 if one exists); SA can also call it | session user |
| POST /onboard/sample-data/wipe | RG O | O | `req.user.businessId` (live DB value) |
| GET /onboard/checklist | - | O M S (SA: businessId null, likely 500, unverified) | `req.user.businessId` |
| POST /onboard/checklist/dismiss | RG O | O | `req.user.businessId` |

**ProductsController** (`/product`, T, SG; PG on each method)
| Route | Needs | Pass | Biz | id scope |
|---|---|---|---|---|
| POST addcategory | write:products | O M | uid->db + header branch | n/a |
| POST addproduct | write:products | O M | uid->db; `body.branchId` checked by `resolveBranchId` (business scoped); **`vendorId` not checked** (F10) | n/a |
| GET getproducts | read:products | O M S (cost stripped for S) | uid->db, header branch | n/a |
| GET global-stock | read:products | O M S (stripped) | uid->db | n/a |
| GET getcategories / getcabinets / getbranches | read:products | O M S | uid->db | n/a |
| POST addcabinet | write:products | O M | uid->db, branch checked in business | n/a |
| PATCH category/:id | write:products | O M | uid->db | `findFirst {id,businessId}`; **404 is 400** (S3-6) |
| PATCH cabinet/:id | write:products | O M | uid->db | `findFirst {id,businessId}` -> 404 |
| POST category/:id/delete, POST cabinet/:id/delete | write:products + RG O/SA | O | uid->db | `findFirst {id,businessId}` |
| POST bulk-restock | write:products | O M | uid->db; **`vendorId` not checked** (F10) | product `findFirst {id,businessId}` |
| POST import | write:products | O M | uid->db; **`item.vendorId` not checked** (F10) | n/a |
| PATCH updateprice/:id | write:products + RG O | O | uid->db | `findFirst {id,businessId}` |
| POST move-stock | write:products | O M | uid->db | product and target branch business-scoped |
| PATCH instances/:instanceId, POST instances/:instanceId/photo | write:products | O M | @Tenant | `findFirst {id, product:{businessId}}` (upload runs before the ownership check, D4) |
| PATCH :id | write:products | O M (can edit basePrice, minSalePrice, defaultCostPrice) | @Tenant | `findFirst {id,businessId,deletedAt:null}` |
| DELETE :id | delete:products + RG O/SA | O | uid->db | `findFirst {id,businessId,deletedAt:null}` (soft) |
| GET :id/details | read:products | O M S (stripped for S) | uid->db | `findFirst {id,businessId}` |

**CategoryController** (`/category`) and **CabinetController** (`/cabinet`): same permissions and service as above.
GET (read:products, O M S), POST (write:products, O M), PATCH :id (O M), POST :id/delete and DELETE :id (write:products + RG O/SA, O).
`PATCH /cabinet/debug-reorder` has **SG only** and returns `{success:true}` (leftover stub, S3-7). Category `:id` misses answer 400, not 404.

**OrdersController** (`/order` and `/orders`, class T; SG per method)
| Route | Needs | Pass | Biz | id scope |
|---|---|---|---|---|
| POST neworder | create:order | O M S | uid->db; **`body.branchId` overrides header**, only business-checked (S3-1); **`customerId` not tenant-checked** (F9); client may set order `id` | n/a |
| GET getallorders | read:orders | O M S | uid->db, header branch | n/a |
| GET :id | read:orders | O M S | uid->db | `findFirst {id,businessId}` (not branch scoped, S3-1) |
| PATCH :id/status, PUT updatestatus/:id | update:order + RG O M S | O M S | `req.user.businessId` | `findFirst {id,businessId}`; **STAFF can CANCEL or set any status** (F7); unscoped `findUnique` fallback if businessId falsy (`orders.service.ts:676-683`, S3-5) |
| PATCH :id/settle-memo | update:order + RG O | O | uid->db | `findFirst {id,businessId}` |
| POST recordpayment | update:order | O M S | uid->db | `findFirst {id:orderId,businessId}` |
| POST :id/return | update:order + RG O M | O M | uid->db | `findFirst {id,businessId}` |
| GET public/invoice/:id | **T only** | public (bearer = order UUID) | none | `findUnique {id}`; returns full customer row (F12) |

**CustomersController** (`/customer`, T, SG, PG at class)
| Route | Needs | Pass | id scope |
|---|---|---|---|
| POST newcustomer | write:customers | O M S (S can set `creditLimit`, F3) | n/a |
| PUT customerdetails/:id | write:customers | O M S | `findFirst {id,businessId}` then `update {where:{id}, data: <raw body>}` -> **mass assignment (F3)** |
| PATCH customerrisk/:id | manage:risk + service blocks STAFF | O M | `findFirst {id,businessId}` |
| GET getallcustomers | read:customers | O M S | businessId filter |
| GET :id/ledger, GET :id | read:customers | O M S | `findFirst {id,businessId}`; postings filtered by `transaction.businessId` |

**TeamController** (`/team`, class T)
| Route | Guards | Pass | Biz | Notes |
|---|---|---|---|---|
| POST invite | SG, PG manage:team | O (M cannot: no manage:team; `MANAGER` branch in service is dead) | `req.user.businessId` | role checked in service (O -> M/S only); expiry 72 h |
| GET invite/:token | T only | public | token = 32 random bytes hex | returns email, role, businessId |
| POST join, POST accept-invite | T only | public | `invitation.businessId` | no password policy; response includes the user row with the password hash (S3-4) |
| GET activemembers, GET active, GET pendinginvites, GET pending | SG, PG manage:team | O | uid->db | |
| PATCH updaterole, PUT role | SG, PG manage:team | O | target must be in same business | **role is not validated -> OWNER can set SUPER_ADMIN (F1)** |
| DELETE removemember, DELETE remove | + RG O | O | same-business check | hard `user.delete`; no self or OWNER-target guard (S3-10) |
| POST resendinvite, POST resend-invite | SG, PG manage:team | O (service re-checks) | `currentUser.businessId` (body `businessId` ignored) | |
| DELETE cancelinvite, DELETE cancel-invite | + RG O | O | `email_businessId` compound key with session business | |

**TeamMembersController** (`/team/members`, class T, SG, PG manage:team, RG)
| Route | Extra | Pass | id scope |
|---|---|---|---|
| GET /, POST / | - | O (comment says M may create STAFF, but PG blocks M) | list by businessId; roles M/S only |
| PATCH :id, POST :id/reset-password, :id/sign-out-all, :id/deactivate, :id/reactivate | RG O | O | `loadTarget findFirst {id,businessId}` -> 404; OWNER targets and self refused; role dto limited to M/S |

**SettingsController** (`/settings`, class T, SG, RG `O, SA`, so all routes are OWNER-only)
| Route | Notes |
|---|---|
| GET profileinfo, profile, businessinfo, business | uid->db |
| PUT profile, updateprofileinfo | name, phone, avatar, `newPassword` writes the deprecated `User.password` only (no current-password check; has no effect on Better Auth credential login, S3-11) |
| PUT business, updatebusinessinfo | whitelisted fields only |
| POST branch | plan limit enforced |
| PATCH branch/:id, DELETE branch/:id | `findUnique` then `branch.businessId === user.businessId` -> 404 |
| POST staff | **role from body unvalidated, invite never expires -> OWNER can mint SUPER_ADMIN (F2)** |

**CashController** (`/cash`, class T, SG, PG)
| Route | Needs | Pass | Notes |
|---|---|---|---|
| POST expense | manage:cash | O M S | **`dto.branchId` not validated against business** (F11) |
| GET expenses, register/status, register/z-report, register/sessions | read:cash | O M S | header branch; z-report `findUnique {id:sessionId}` unscoped but then requires `session.branchId === header branch` (cross-tenant safe only through that check, S3-12) |
| POST register/open | manage:cash | O M S | **`dto.branchId` not validated** (F11) |
| POST register/close | manage:cash | O M S | branch from **body only** (D7); lookup is business scoped; restricted staff can close any branch of the business |

**DashboardController** (`/dashboard`, T, SG; **no PG**): GET /dashboard and /dashboard/dashboarddata, O M S.
Cache is not role keyed (F4). SA falls back to the newest business (F13).

**InventoryController** (`/inventory`, T, SG, PG): POST restock (write:products, O M; vendor checked inside the tx),
GET movements, GET restock-history (read:products, O M S), GET low-stock (read:products, O M S, **returns `costPrice`**, F6).
`branchId` comes from the query string (not header-validated); queries are business scoped.

**ReportsController** (`/reports`, class PG read:reports): GET financial, inventory, staff, customers, all O M. Header branch; business via uid->db.

**VendorsController** (`/vendors`, T, SG, PG)
| Route | Needs | Pass | id scope |
|---|---|---|---|
| POST / | manage:vendors | O M | n/a |
| GET /, GET :id | read:vendors | **O M S** (cost data, F5) | `findFirst {id,businessId}` |
| POST :id/purchase, POST :id/payment | manage:vendors | O M | `findFirst {id,businessId}` |

**DuesController** (`/dues`) and **KhataEntriesController** (`/khata-entries`), T, SG, PG, @Tenant
GET summary, GET /, GET :type/:id/whatsapp-link, GET /khata-entries, GET /khata-entries/:id: read:dues, O M.
POST :type/:id/promise|reminded, POST /khata-entries, PATCH :id, POST :id/settle, POST :id/promote: manage:dues, O M.
POST /khata-entries/:id/write-off: write-off:dues, **O only**. All `:id` lookups are `findFirst {id,businessId}` (`khata-entries.service.ts:80`, `dues.service.ts:480-491`) -> 404.

**NotificationsController** (root, T, SG, PG): GET notifications, POST notifications/read, GET notification-settings (read:notifications, O M S; read/update are `businessId + userId` scoped);
PUT notification-settings (manage:notification-settings, O M).

**RemindersController** (`/reminders`, RG O): POST run; throws 404 unless `ENABLE_TEST_ENDPOINTS=true` (`.env.example:39` sets false).

**ReservationsController** (`/reservations`) / **StockTransfersController** (`/stock-transfers`) / **StockFinderController** (`/stock/find`): T, SG, PG, @Tenant, `ParseUUIDPipe` on `:id`.
Reservations: POST (manage:reservations O M S), POST :id/release (same), GET (read:stock-finder). Transfers: POST and :id/cancel (request:transfers O M S; cancelling a DISPATCHED transfer needs manage:transfers), :id/dispatch and :id/receive (manage:transfers O M), GET and GET :id (read:stock-finder).
All `:id` loads are `findFirst {id,businessId}`. Stock finder only returns cost to O and M (`stock-finder.service.ts:68`), the model the other modules should follow.

**SyncController** (root, T, SG, no PG): GET sync/pull (all roles; cost columns omitted for STAFF, business scoped, branch access enforced in `resolveAccess`),
POST sync/batch, POST sync, POST order/sync (per item permission map `SYNC_PERMISSIONS`, claims checks on client ids).

**PlansController** (`/plans/usage`, RG O+SA, @Tenant): O only (SA gets 403, no tenant).

**Desktop** `desktop/devices` (RG O, @Tenant): POST /, GET /, POST :id/revoke (`findFirst {id,businessId}`) -> O only.
Device API (`DeviceAuthGuard`, token hash lookup, not a session): POST desktop/licence, POST sync/desktop/push, GET sync/desktop/pull. Business comes from the Device row; acts as the first OWNER; skips READ_ONLY/expiry (F14).

**AccessLogController** `GET /settings/access-log` (RG O, M): tenant's own `AdminAccessLog` rows.

**Agency, all `SG + RG SA`, no Throttler**: `/agency/*` (AgencyController: onboard-tenant, tenants, tenants/:id, tenants/:id/view-as, tenants/:id/status, tenants/:id/billing, branch/:businessId, signups, signups/:businessId, tasks, tasks/:id),
`/agency/analytics/*` (overview, tenants, tenants/:id, usage-statement.pdf), `/agency/billing/*` (invoices CRUD, send, void, payments). Verified: SA only.
Public: `GET /public/invoices/:token` and `/:token/pdf` (T only; 256-bit token, drafts hidden; this is the agency's invoice to a tenant, minimal data).

---

## 2. Effective access that looks wrong for a shop

STAFF
* Can read cost and supplier payables: GET /vendors and /vendors/:id return `unitCost`, `totalCost`, `avgUnitCost`, `metrics.totalCostValue`, `totalPurchased`, `balance` with no stripping (F5). GET /inventory/low-stock returns `costPrice` (F6). Dashboard profit leaks through the shared cache (F4). The client sidebar shows Vendors to STAFF and the vendor page renders these columns (`vendors/[id]/page.tsx:670-801`).
* Can void any order in the business: `PATCH /order/:id/status {status:"CANCELLED"}` restocks and **hard-deletes the ledger transactions** of the order; also can set any status (F7). The UI hides "Cancel Order" for STAFF, the server does not. `POST /:id/return` and `settle-memo` are correctly blocked, but the status route reaches the same outcomes.
* Can sell below the minimum price using the order `discount` (F8).
* Can set `creditLimit` and `isDefaulter` through `customerdetails` (F3) and `newcustomer`, although `customerrisk` is blocked for STAFF.
* Can read the Z-report, expected cash and expenses (`read:cash`) and can close a register another person opened. Probably intended for a cashier; flag for a product decision.
* Cannot: delete products, change prices, read reports, manage team or settings, write-off dues. Those hold.

MANAGER
* Can edit `basePrice`, `minSalePrice` and `defaultCostPrice` through `PATCH /product/:id`, while the dedicated `PATCH /product/updateprice/:id` is OWNER-only. The two are inconsistent; decide whether managers set prices.
* Can read the tenant's support access log (`/settings/access-log`), record vendor payments, run cash, restock, create/dispatch transfers, return orders. All plausible.
* Cannot touch billing, plan usage, team, devices, settings (all OWNER-only). No endpoint exists that deletes a business or changes anything about OWNER. No MANAGER escalation path was found.

Escalation
* OWNER -> platform SUPER_ADMIN: F1 and F2. This is the only role escalation found. A normal STAFF or MANAGER cannot escalate themselves.
* OWNER can also set a second OWNER (`updateRole` with `role:'OWNER'`); decide if intended.

---

## 3. Public routes and Throttler-only routes

| Route | Guard | Intended? |
|---|---|---|
| GET /, /health, /health/db | none | Yes for health. `/health/db` returns `err.message` (S3-2). |
| POST /auth/register, /login, /agency-login | T | Yes |
| POST /auth/view-as/activate | T 10/min | Yes (token is the credential) |
| GET /team/invite/:token, POST /team/join, POST /team/accept-invite | T only (class-level `@UseGuards(ThrottlerGuard)`, `team.controller.ts:24`; the invite token is the credential) | Yes. See S3-4 for password policy. |
| GET /order/public/invoice/:id | T (class) | Public by design (customer invoice link). Over-shares (F12). |
| GET /public/invoices/:token, /:token/pdf | T | Yes (agency invoices) |
| /api/auth/* (Better Auth) | Better Auth rate limits and lockout hooks | Yes, but not covered by SessionGuard (S3-8) |
| POST /desktop/licence, /sync/desktop/push, GET /sync/desktop/pull | T + DeviceAuthGuard | Yes (device token). F14. |
| Agency, billing, analytics controllers | SG + RG, **no T** | Acceptable (SA only), noted. `UserAccountController`, `UserController`, `BusinessController`, `ViewAs session-info` are SG only, no T. |

---

## 4. IDOR and tenancy review

* **businessId only from the session**: yes everywhere. No route reads `businessId` from body, query or header for tenant logic.
  `resendInvite` destructures `businessId` from the body but ignores it (`team.service.ts:361`). Agency routes take it from `:id`/`:businessId` by design.
* **Services that accept a userId from the client**: none. All pass `req.user.id` / `tenant.userId`.
* **`:id` lookups**: every `:id` route in section 1 is scoped by `businessId` in the service query (or by a business scoped parent), with these exceptions:
  `GET /cash/register/z-report?sessionId` (unscoped `findUnique`, saved by the branch compare), `orders.service.ts:676-683` (unscoped fallback, not reachable by SA since RG excludes it),
  `reports.service.ts:295` (`customer.findUnique {id: stat.customerId}` unscoped; becomes cross-tenant read through F9),
  `settings.service.ts` branch routes (`findUnique` then compare, correct).
* **Body-supplied foreign keys that are not tenant-checked** (the real IDOR surface):
  `customerId` on order create (F9), `vendorId` on addproduct, bulk-restock, import (F10), `branchId` on cash expense and register open (F11), and everything in the raw customer update body (F3).
* **Raw SQL**: `products.service.ts` (`findProductIdPage`, `getGlobalStock`) filters `p."businessId"`; `orders.service.ts:391-399` locks instances by `productId` already verified in the business; stock-finder raw SQL filters `businessId`; `$queryRaw SELECT 1`. No unscoped raw query found.
* **Reporting and sync**: reports are business and header-branch scoped. `sync/pull` is well built (STAFF has no cost columns, branch access enforced). `sync/batch` skips DTO validation and the header branch (F15).
* **Agency endpoints for non-SA**: all behind `SG + RG SA`; the kill-switch spec covers `tenants/:id/status` for O M S. Impersonation creates a session for `business.ownerId` with `impersonatedBy` and a 1 h expiry.
* **View-as write blocking**: enforced in SessionGuard for non-GET (`session.guard.ts:76-82`). Gaps: S3-8 (Better Auth routes, `touchActivity` writes). No GET route that mutates tenant data was found besides `touchActivity`.
* **Branch-restricted staff (UserBranch)**: header branch is enforced; body and query branches are not (S3-1).

---

## 5. Client gating versus server

UI hides it, server still allows (informational, but see F7):
* `orders/[id]/page.tsx:908` hides the "Cancel Order" Danger Zone for STAFF; `PATCH /order/:id/status CANCELLED` works for STAFF.
* `settings/page.tsx:138` shows the access-log tab only with `manage:business` (OWNER); server also allows MANAGER.
* `EditProductModal.tsx:45` hides cost for STAFF, which is right, but the vendor and restock pages show cost without any role check (server also allows).
* `Sidebar.tsx:156` hides Store Settings only for STAFF; the server allows O only.

UI shows it, server rejects:
* **MANAGER sees "Store Settings"** (`role-matrix.spec.ts` encodes this) but `GET /settings/profileinfo` and `/businessinfo` are OWNER-only (`SettingsController` RG), so the page shows "Failed to load settings data." for MANAGER. Same for PUT /settings/profile: STAFF and MANAGER cannot edit their own profile.
* **Order page**: "Convert to Final Sale" (MEMO) and the per-item return icon (`order-item-return`) are rendered for every role; server `settle-memo` is O-only and `return` is O/M. STAFF and MANAGER get a 403 toast.
* **D8 (MANAGER Revoke button)**: by code reading MANAGER cannot reach the Team tab at all (`manage:team` missing on both sides: `usePermissions.ts`, `config/permissions.ts`; `TeamTab` buttons are `disabled` without it). D8 may be stale or only reproducible through a direct URL; **unverified** in a browser. The server answer is correct (403, `@Roles('OWNER')`).
* `Restock Hub`, `Categories`, `Cabinets` are visible to STAFF; every write behind them is 403.

Agency-admin: gating is client-side (`AuthContext` compares `/user/me` role to SUPER_ADMIN); the server enforces SA on every `/agency` route, so a bypass only reveals empty shells.

---

## 6. Test coverage gaps

Existing: `role-matrix.spec.ts` covers 7 routes x 3 roles plus nav visibility. `tenant-isolation.spec.ts` covers GET by id for 6 entities,
transfers GET, and 12 list endpoints. `security.e2e-spec.ts` covers forged token, onboarding, team invite role limits, logout, x-branch-id, vendor payment as STAFF, foreign product in order.
`accounts.e2e-spec.ts` covers members CRUD, T/B isolation on `team/members`, branch-restricted staff. `kill-switch` covers status changes by role. `orders-rules` covers staff min price and cost stripping.
`dues`, `khata`, `desktop`, `reminders` each carry a tenant B test.

Gaps that matter most (none exist today):
1. **Privilege escalation**: `PATCH /team/updaterole` and `POST /settings/staff` with `role: SUPER_ADMIN` and `OWNER`. The only updaterole tests use MANAGER/STAFF (`invite-flow.spec.ts:109-128`).
2. **Mass assignment**: `PUT /customer/customerdetails/:id` as STAFF with `{creditLimit, isDefaulter, businessId, orders:{deleteMany:{}}}`. The only use is a read-only-mode write (`kill-switch:206`).
3. **The "ownerB cannot mutate" isolation test is vacuous**: it calls `PATCH /customer/:id` and `DELETE /customer/:id`, which do not exist (404/405 are accepted). The real mutating routes with no cross-tenant test: `customerdetails`, `customerrisk`, `product/:id` PATCH/DELETE, `updateprice`, `instances/:id`, `order/:id/status|return|settle-memo`, `recordpayment`, `vendors/:id/purchase|payment`, `khata/:id/update|settle|write-off|promote` (khata and dues have their own), `category/:id`, `cabinet/:id`, `settings/branch/:id`, `reservations/:id/release`, `stock-transfers/:id/dispatch|receive|cancel`.
4. **STAFF x cost**: `GET /vendors/:id`, `GET /inventory/low-stock`, `GET /dashboard` after an OWNER call (Redis on). Only product and stock-finder stripping is tested.
5. **STAFF x order mutations**: cancel, set status, discount below minimum, `discount` equal to total, `customerId` of another tenant, `vendorId` of another tenant.
6. **Role x route sweep**: an automated test that walks every route with each of O/M/S and asserts against section 1. Today 7 routes are tested.
7. **Branch-restricted users**: body `branchId` on neworder, cash register, reservations; `GET /order/:id` for another branch; `inventory/low-stock?branchId`.
8. **Sync/desktop**: batch with negative price, fractional quantity, foreign `branchId`; desktop push while the tenant is READ_ONLY or expired.
9. **SA outside /agency**: `GET /dashboard` as SA (F13).
10. **View-as**: that Better Auth routes (`/api/auth/update-user`, `revoke-other-sessions`) and `touchActivity` are blocked or logged. `view-as.e2e-spec.ts` covers activation only; the write-block itself is in `e2e/tests/agency/view-as.spec.ts` (untracked, not read).

---

## 7. Findings, ranked

### S1 (privilege escalation / cross-tenant)

**F1. OWNER can promote a member to SUPER_ADMIN.**
`team/team.controller.ts:94-105` (`@Body() body: any`), `team/team.service.ts:292-316` (`data: { role }`, no whitelist).
Scenario: OWNER invites or creates a member (or uses a second email), then `PUT /team/role {"email":"<member>","role":"SUPER_ADMIN"}`. Prisma accepts the enum. The member signs in at `/auth/agency-login`, `SessionGuard` returns early for SA (`session.guard.ts:85`) and `/agency/*` (all tenants, billing, view-as) opens. Also `role:"OWNER"` is accepted.
Fix: DTO `@IsIn(['MANAGER','STAFF'])` (add an explicit ownership-transfer flow if wanted); in the service reject `role` outside `ASSIGNABLE_ROLES` and targets that are OWNER. Defense in depth: SessionGuard refuses `role === SUPER_ADMIN && businessId != null`; consider a DB CHECK that a SUPER_ADMIN has `businessId IS NULL`.

**F2. OWNER can mint a SUPER_ADMIN through the settings invite alias, and the invite never expires.**
`settings/settings.controller.ts:95-97`, `settings/settings.service.ts:302-345` (role from body, no check, no `expiresAt`, no `assertOwnerVerified`, no branch handling). `team.service.ts` `acceptInvite` copies `role: invitation.role` into the new user.
Scenario: `POST /settings/staff {"email":"me+2@x.com","role":"SUPER_ADMIN"}`; accept at `POST /team/join`; sign in at agency-login. D11 already says no UI calls this alias.
Fix: delete the alias (preferred; `POST /team/invite` exists) or route it to `TeamService.inviteStaff`. Same DTO and defense in depth as F1.

**F3. Mass assignment in `PUT /customer/customerdetails/:id` (STAFF and up).**
`customers/customers.controller.ts:30-37` (`body: any`), `customers/customers.service.ts:141-166`: `prisma.customer.update({ where:{id}, data })` with the raw body.
Scenarios (Prisma input shapes; not executed):
(a) STAFF sends `{"creditLimit":9999999,"isDefaulter":false}`, bypassing the STAFF block in `customerRisk` (`:172-176`).
(b) Any writer sends `{"businessId":"<other tenant uuid>"}`: the customer is moved into another tenant (silent data injection; business ids leak through the public invoice, F12, and invite lookup).
(c) `{"orders":{"deleteMany":{}}}` deletes every order, item and payment of a customer; `{"orders":{"connect":[{"id":"<foreign order>"}]}}` re-parents a foreign order and exposes it through `GET /customer/:id`.
Fix: typed `UpdateCustomerDto` with whitelisted scalar fields (name, phone, shopName, address, email, cnic, guarantorPhone, paymentTermsDays); keep `creditLimit` and `isDefaulter` only in `customerRisk`; use `updateMany({where:{id,businessId}})`. Also reject `creditLimit` in `newCustomer` for STAFF (`customers.service.ts:128`).

### S2 (role data leak, integrity, tenancy rule breaches)

**F4. Dashboard cache is not role keyed: STAFF can receive OWNER profit figures.**
`dashboard/dashboard.service.ts:53` (key `dashboard:${businessId}:branch:${branchId}`), masking at `:249-261`, cached at `:272` for 600 s. Only with `REDIS_URL` set (otherwise the cache is a no-op, `redis.service.ts:21`).
Scenario: OWNER opens the dashboard; STAFF opens it within 10 minutes and receives `dailyCOGS`, `netProfit`, `profitMargin`, `dailyExpenses` (and the reverse: OWNER sees masked nulls after a STAFF call).
Fix: add the role class (`staff|full`) to the key, or cache the unmasked result and mask after reading.

**F5. STAFF can read supplier cost data.** `config/permissions.ts:88` (STAFF has `read:vendors`), `vendors/vendors.controller.ts:34-43`, `vendors/vendors.service.ts:273,322,337-346` (no `stripCostForStaff`; the key list only knows `defaultCostPrice`/`unitCost`, and `totalCost`, `avgUnitCost`, `totalCostValue`, `totalPurchased`, `balance` are different keys). Client renders them for every role (`vendors/[id]/page.tsx:670-801`).
Fix: split `read:vendors` (names, phones) from `read:vendor-ledger` (O M), or mask cost and payable fields for STAFF server-side.

**F6. `GET /inventory/low-stock` returns `costPrice` to STAFF.** `inventory/inventory.service.ts:298`, controller `inventory.controller.ts:33` (read:products; no strip, and `costPrice` is not in `COST_KEYS`, `products.service.ts:10`). Also cached unmasked for 1 h.
Fix: drop the field for STAFF or add `costPrice`, `avgUnitCost`, `totalCost` to `COST_KEYS` and apply the strip in this controller; do not cache per role.

**F7. STAFF can void any order and rewrite statuses; cancel hard-deletes ledger rows.**
`orders/orders.controller.ts:69-95` (`@Roles('OWNER','MANAGER','STAFF')`), `orders/orders.service.ts:794-841` (CANCELLED: restock + `tx.transaction.deleteMany` for the order; paid payments stay), `:843-846` (any other status is a plain update), DTO `update-order-status.dto.ts` is a bare string.
Scenarios: STAFF cancels a paid FINAL order from yesterday (cash taken, receivable wiped, stock back); STAFF sets `FINAL` on a MEMO without payment or posting (bypassing OWNER-only `settle-memo`); any bogus status gives a 500. `neworder` also accepts `orderStatus:"CANCELLED"`, which still consumes stock (`orders.service.ts:100,361-390`).
Fix: allow CANCELLED/RETURNED only for O M (use `processReturn`/a void flow that posts reversal entries instead of deleting), validate the status enum and legal transitions, and never delete transactions.

**F8. STAFF can bypass `minSalePrice` with the order `discount`.**
`orders/orders.service.ts:215-231` checks the unit price only; `:246` only requires `discount <= total`. Test `orders-rules.e2e-spec.ts:96-200` never uses `discount`. With min price 8000 and price 8000, `discount: 7000` goes through for STAFF. A product with no `minSalePrice` accepts any price, including 0.
Fix: apply the floor to the net line price (price minus allocated discount) for STAFF, or require a reason and role for any discount above a limit.

**F9. Order `customerId` is not tenant-checked.** `orders/orders.service.ts:315` (`customerId: customerId || null`; the only business-scoped customer lookup is for payment terms, `:292`). Ledger postings are written against the foreign id. `getOrderById` then returns the whole foreign customer row (`include:{customer:true}`, `:640`) and `reports.service.ts:295` reads name and defaulter flag. Needs the customer UUID; foreign orders also pollute that customer's totals (`customers.service.ts:240-247` loads `orders` unfiltered).
Fix: verify `customer.findFirst({id, businessId})` at the start of the transaction; scope the relation queries by `businessId`. Same in the sync path (it calls `newOrder`).

**F10. `vendorId` is not tenant-checked in `addproduct`, `bulk-restock`, `import`.**
`products/products.service.ts:270,292,671,693,996`. `inventory.restock` does check it (`inventory.service.ts:157`). Effect: ProductInstance and VENDOR_PAYABLE postings point at another tenant's vendor; that vendor's list/detail (`vendors.service.ts` queries instances by `vendorId` with no business filter) then show the foreign instances, product names and costs (cross-tenant write that becomes a read for the victim, and unit counts for the victim). Needs the vendor UUID.
Fix: `vendor.findFirst({id, businessId})` before use; filter instance/movement queries in the vendor services by product business.

**F11. Body `branchId` is not validated on cash routes.**
`cash/cash.service.ts:77` (expense), `:309-320` (register open), `:350` (close, body only; D7). Foreign branch ids pass the FK, and responses include `branch:{id,name}`, so a known foreign branch UUID leaks its name; branch-restricted staff can open/close registers for branches they do not have. CLAUDE.md requires branch validation.
Fix: use `req.tenant.branchId` (validated, restriction aware) and ignore body `branchId`, or check `branch.findFirst({id,businessId})` plus the user's UserBranch.

**F12. Public order invoice returns the whole customer record and internal ids.**
`orders/orders.service.ts:1044-1076`: `include:{customer:true}` and `...order` spread. Anyone with the link sees `cnicNumber`, `guarantorPhone`, `creditLimit`, `isDefaulter`, `address`, `businessId`, `branchId`, `createdBy`, payment `receivedBy` ids. Token is the order UUID; the client can also choose the order id (`create-order.dto.ts` `id`, `orders.service.ts:312`), so ids can be predictable.
Fix: explicit `select` of invoice fields only (name, phone, address, items, totals, payments amount/date/method, business name/logo/phone); generate order ids server-side or use a separate random `publicToken`.

**F13. SUPER_ADMIN can read a tenant dashboard without an access-log entry.**
`dashboard/dashboard.service.ts:41-47`: SA with no business gets the newest business. The interceptor only logs `/agency/*` and impersonated sessions (`access-log.interceptor.ts:80-95`), so `GET /dashboard` as SA reads revenue and profit unlogged. SA also passes any `x-branch-id` unvalidated.
Fix: remove the SA fallback (SA should use view-as, which logs).

**F14. Desktop device endpoints ignore READ_ONLY and expired subscriptions.**
`desktop/device-auth.guard.ts:47` only checks SUSPENDED; SessionGuard blocks writes for READ_ONLY/expired (`session.guard.ts:113-122`). `POST /sync/desktop/push` writes orders, payments, khata, expenses, customers as the first OWNER.
Fix: reuse `tenantCache.getBusinessStatus` in `DeviceAuthGuard` and reject non-GET when READ_ONLY or expired.

**F15. The sync batch skips DTO validation and the validated header branch.**
`sync/sync.service.ts:200` passes the raw `payload` to `newOrder`: item `price` may be negative and `quantity` fractional (REST DTO forbids both, `create-order.dto.ts`); with no `minSalePrice` a negative line gives a negative total. `t.branchId` (validated, restriction aware) is never merged, so the branch is whatever the payload says (business-checked only) or null, in contrast to the controller comment at `sync.controller.ts:30`.
Fix: run `validate(CreateOrderDto)` in `createOrder`, force `branchId: t.branchId`.

### S3 (hardening)

1. Branch restriction gaps: body or query `branchId` overrides on neworder, reservations (`reservations.service.ts:77`), restock lines, `inventory/*` query; `GET /order/:id`, order mutations, customers, vendors and transfers dispatch/receive are not branch scoped. `GET /product/getbranches` lists all branches. N3 only fixed header handling.
2. `GET /health/db` returns `err.message` publicly (`app.controller.ts:76-82`), may disclose host and port.
3. `POST /user/change-password` has no throttle or lockout (`user-account.controller.ts`); a stolen session can guess the current password online.
4. `acceptInvite` has no password policy and returns the created user row including its password hash (`team.service.ts:234`, `user: result`); `settings.inviteStaff` invites have no expiry.
5. `orders.service.ts:676-683` unscoped `findUnique` fallback when `businessId` is falsy; currently unreachable because the routes exclude SA.
6. Category PATCH/DELETE answer 400 "Category not found" for another tenant's id instead of 404 (`category.service.ts`), contrary to the CLAUDE.md rule.
7. `PATCH /cabinet/debug-reorder` is a leftover stub with only SessionGuard.
8. View-as read-only is enforced by SessionGuard only: `/api/auth/*` (for example `update-user`, `revoke-other-sessions`) is outside it, and `touchActivity` (`session.guard.ts:70,170`) writes `lastActiveAt` on the tenant user and business during a read-only session, skewing lifecycle and inactivity logic. The view-as URL carries the raw session token in the query string (`agency.service.ts` `createViewAsSession`). **unverified** at runtime for the Better Auth routes.
9. Enumeration: register ("Email Already Exist"), sync and desktop "Id already in use" (confirms a UUID exists in another tenant), duplicate-id errors on `neworder`.
10. `team.service.removeMember`: hard `user.delete`, may be allowed on yourself or another OWNER and may fail on FK (`Payment.receivedBy`, `InventoryMovement.userId`) with a 500 (**unverified**); `updateRole` can create extra OWNERs.
11. `settings.updateProfileInfo` writes `newPassword` to the deprecated `User.password` without a current-password check; it does not change the Better Auth credential and is misleading (and `ensureCredentialAccount` copies it only when no credential account exists).
12. `getZReport` relies on the branch compare (`cash.service.ts:443`) for tenant safety; add `businessId` to the `sessionId` lookup.
13. `creditLimit` and `isDefaulter` are never enforced when an order is created (`orders.service.ts` has no reference), so they are advisory only.
14. Cloudinary uploads have no size limit (`utils/cloudinary.storage.ts`, FileInterceptor without `limits`), and the instance photo upload runs before the ownership check (D4).
15. Better Auth `update-user` can change `username`, **unverified**: a staff member could squat another business's `handle@slug` login (`better-auth.ts` validator is pattern-only).
16. Role and business cache is per process (30 s); a demotion on one instance can lag on another in a multi-instance deployment.
17. `manage:business` is granted but unused server-side; settings rely on `RolesGuard O` instead. Align the matrix so permissions are the single source of truth.

### Verified as sound (no finding)
Live role from DB, deactivation and role-change revocation, SA required for agency, kill switch and read-only, x-branch-id validation, team members `:id` 404s, khata/dues/reservations/transfers/stock-finder scoping, `sync/pull` cost stripping and branch access, device revoke scoping, public agency invoice token strength, `x-dk-require-role` spoof protection, impersonated session write block in SessionGuard.
