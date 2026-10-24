# DeepKhata Architecture and 7-Day Finish Plan

Oct 24, 2026 · @Deep Dev Solutions

## In short

The architecture you want is already about 80% of what's in the repo. Next.js frontend, NestJS backend, Postgres, each in its own container on the server, plus an Electron on-premises app with the backend built in: all of that exists on `final-fixes`. What's actually missing or messy:

1. **Nobody holds the design in their head.** This doc fixes that. Keep it as the map, and check every agent change against it.
2. **The Electron Online app doesn't exist yet.** It's the thin app that just opens our cloud system. It's small: about a day of work.
3. **Custom per-shop pricing has no admin screen.** The database already stores a custom price and custom limits per shop; there's just no form to set them.
4. **The UI works but looks unpolished and inconsistent.** This is the biggest job of the week, and also the riskiest.
5. **Local development runs only the database in Docker.** Add a one-command, fully containerised stack.

**Can it be final in a week?** Yes, but only if we freeze features today, polish rather than redesign the UI, and push the barcode scanner, bakery/pharmacy features and installer code-signing to after launch.

## How the system works

&#91;embedded content: DeepKhata architecture: our server vs the shop's PC\]

**Cloud and Desktop Online (left):** the shop opens our app in a browser or in the Desktop Online app. Requests go through Cloudflare to our server. There, Caddy sends each one to the right container: `client` serves the shop screens, `admin` our agency panel, and `api` holds every business rule (sales, khata, stock, billing) and is the only part that talks to `postgres`. The `backup` container copies the database to Cloudflare R2 every night. If the internet drops, sales wait in the browser's local storage and sync when it's back.

**On-Premises (right):** the same screens, the same API code and the same database type run inside one desktop app on the shop's main PC. Other counters open that PC's address over the shop network. Nothing needs internet; an optional cloud backup can be added later.

**Outside services:** Resend sends emails, Cloudinary stores product photos, and Cloudflare Turnstile stops bots at signup and login.

## What we want vs what exists

| Want | Exists today (`final-fixes`) | Gap to close this week |
| --- | --- | --- |
| Next.js frontend | `apps/client` (shop app) and `apps/agency-admin` (our panel) | UI polish |
| NestJS backend | `apps/server`: auth, POS, khata/ledger, inventory, dues, stock finder, billing, analytics, sync | Freeze; fix only bugs |
| Postgres | One schema, migrations 0000 to 0011+, seed data | None |
| Each part in its own container | `deploy/docker-compose.prod.yml`: postgres, api, client, admin, caddy, backup | Add a full-stack dev compose + `npm run stack:up` |
| Electron app, online, with offline mode | Not built. The web app already caches data and queues sales offline (Dexie) | Build a thin Electron shell that opens the cloud app |
| Electron app, standalone with the backend inside | `apps/desktop`: embedded Postgres, API, client, shop-network (LAN) mode, licence, backups | Build the Windows installer on a Windows PC; test on a shop PC |
| POS, ledger, inventory for every business | All three built and tested | UI polish |
| Custom price per shop | Database has a per-shop custom price and custom limits | Admin form to set price, limits and dates per shop |
| Trial, Basic, Standard, Custom plans | Plans are stored in the database | Re-seed with the agreed limits |

## The two desktop apps

Both are built from the same code and the same screens. Only where the backend runs differs.

|  | DeepKhata Online (desktop) | DeepKhata On-Premises |
| --- | --- | --- |
| What's inside | Only a window plus small helpers (printer, cash drawer) | Window + our API + its own Postgres database |
| Where the data lives | Our server | The shop's main PC |
| Internet | Needed; short drops are handled by the offline queue | Not needed |
| Other counters | Install the same app on each PC | Open the main PC's address in a browser over the shop network |
| Updates | Instant (screens come from our server) | Our app's updater, or a visit |
| Size | Small | Large (database included) |
| Status | **To build this week** (about a day) | **Built**: needs a Windows build and a test on a real shop PC |

**Should these be one installer or two?** Two separate installers this week: they're simpler to build, test and explain. We can merge them later.

**Minimum PC for On-Premises:** Windows 10/11 64-bit, 4 GB RAM, SSD. Weaker PCs use the Online app.

## Custom pricing per shop (deals)

In Pakistan the price is agreed face to face, so every shop can have its own deal: one pays 20,000 a year, another 100,000. Plans become **starting templates**, and the real numbers live on each shop's own deal.

**How it works in the admin panel:**

1. Open the shop → **Set deal**.
2. Pick a starting template: Trial, Basic, Standard or Custom. It pre-fills the limits.
3. Change anything for this shop: price (any amount), billing period (monthly, yearly or custom dates), start and end date, branches, accounts, products, and a notes field ("agreed with owner on visit, 20k/year, 2 branches").
4. Save. The app enforces this shop's limits and shows its price on its invoices.
5. When they pay, use **Log payment** (already built) and the end date moves forward.

**For On-Premises shops** the same deal screen issues the licence key: support end date, branches, accounts and price. One screen covers both kinds of customer.

**Already in the database:** each shop's subscription stores a custom price, custom limits and period dates. The work this week is the admin form and making invoices use the custom price.

## Making the UI look professional

A full redesign won't fit in a week. A consistent polish will, and that's what makes software look professional: the same fonts, spacing, buttons, tables and forms on every screen.

1. **Day 3 morning: set the design rules once.** Pick one look (colours, font, spacing, corner radius, shadows) and put it in shared design tokens. Build or clean up the core shared components: button, input, select, table, card, modal, page header, empty state, toast, badge.
2. **Fix the app shell:** sidebar, top bar, page titles and breadcrumbs, the same everywhere.
3. **Then polish the screens shops use daily, in this order:**
   1. POS / new sale
   2. Products and inventory (list, add, restock)
   3. Customers khata and payments
   4. Vendors
   5. Galla / cash register and Z-report
   6. Dashboard
   7. Login, signup and onboarding (first impression)
4. **Everything else** (reports, settings, stock finder, dues, admin panel) just inherits the new components. No custom work this week.
5. **Rules for the agent:** no new features during UI work, keep every `data-testid` so tests still pass, screenshot each screen before and after, and run the end-to-end tests after every screen.

**Risk:** UI changes break tests and flows quietly. That's why the order is shared components first, then one screen at a time, testing after each.

## The 7-day plan

The rule for the week: **feature freeze today.** From here, only the items below and bug fixes.

| Day | Work | Done when |
| --- | --- | --- |
| 1 | Clean the repo: remove dead code (Vercel leftovers, old test scripts, stale branches and worktrees). Full test run on `final-fixes`. Add the full-stack dev compose + `npm run stack:up`. A one-page `ARCHITECTURE.md` in the repo, matching this doc | All tests green; `npm run stack:up` starts everything |
| 2 | Custom deals: admin "Set deal" form, invoices use the custom price, licence issuance from the same screen. Re-seed plan templates (Trial, Basic, Standard, Custom) | A shop can be set to "20k/year, 2 branches, ends 31 Oct 2027" and the app enforces it |
| 3 | UI foundation: design tokens, shared components, app shell. Then POS screen | POS looks finished; POS tests pass |
| 4 | UI: products and inventory, khata and payments, vendors | Those screens finished; their tests pass |
| 5 | UI: galla and Z-report, dashboard, login, signup and onboarding. Admin panel inherits components | All daily screens consistent; full test run green |
| 6 | Electron Online app (thin shell + silent receipt printing). Build the On-Premises installer on a Windows PC | Both installers run on a Windows 10 PC with 4 GB RAM |
| 7 | Deploy to the Oracle staging server; run the stress test; walk GM Traders through it; fix what they hit | GM Traders runs a full day of sales on staging |

If anything slips, cut from the bottom of day 5 (admin polish, onboarding polish) and keep days 6 and 7: a working install beats a prettier screen.

## Cut from this week

These wait until after launch:

- Barcode scanner improvements (phase 2), and bakery or pharmacy features
- Making the On-Premises app lighter for weak PCs (measure first, then decide)
- Windows code signing and auto-update (shops will see a "Windows protected your PC" warning at install; we click through it on site)
- Merging the two desktop installers into one
- Agency analytics polish, and new reports
- Final public price list (needs market visits first; deals cover us meanwhile)

## Prompt for the coding agent

Paste this at the repo root. The agent stops after each day for review, so a wrong turn costs at most one day.

```text
You are finishing DeepKhata in 7 working days. FEATURE FREEZE: build only what is listed here; otherwise fix bugs only.
Repo: /home/jb/Projects/DeepKhata. Create branch finish-week from final-fixes. Read CLAUDE.md and INSTALL.md first.
Target architecture (do not change it): Next.js (apps/client, apps/agency-admin), NestJS (apps/server), Postgres; each in its own container under one compose; two Electron apps: Online (thin shell to the cloud app) and On-Premises (apps/desktop, backend and Postgres inside).

DAY 1  Cleanup and map
- Remove Vercel leftovers (main.ts handler, vercel.json, apps/server/api), legacy apps/server/test/*.js scripts, the jwt-auth.guard stub, and stale worktrees under .claude/worktrees (list them first, delete only merged ones).
- Add docker-compose.yml at the root with profile "full" running postgres, mailpit, api, client and admin built from their Dockerfiles, plus npm scripts stack:up / stack:down / stack:logs.
- Write ARCHITECTURE.md (max 2 pages): parts, containers, request flow, auth (Better Auth cookies), offline (Dexie queue + sync), desktop editions, where each feature lives (module -> folder).
- Run lint, build, API, unit and the full E2E suite; fix failures. Stop and report.

DAY 2  Custom deals
- Agency admin, tenant page: "Set deal" form: template plan, price (any amount), billing cycle (monthly/yearly/custom), start and end dates, maxBranches, maxUsers, maxProducts, notes. Save into Subscription (priceOverride, customLimits, period dates) plus a DealHistory row (who, when, old to new).
- PlanLimitsService and the kill switch must use the deal's limits and dates; invoices default to priceOverride.
- On-Premises shops: the same form issues the desktop licence (support end date, limits).
- Re-seed templates: TRIAL (30 days, 1 branch, 2 users, 100 products), BASIC (1 branch, 5 users), STANDARD (2 branches, 10 users), CUSTOM. Existing tenants keep their current limits.
- API tests plus one E2E test: set a 20k/yr 2-branch deal, third branch blocked, invoice shows 20,000. Stop and report.

DAY 3-5  UI polish (no new features)
- Day 3: design tokens (colour, type, spacing, radius) and shared components in apps/client/src/components/ui (Button, Input, Select, Table, Card, Modal, PageHeader, EmptyState, Badge, Toast); clean app shell (sidebar, top bar, page titles). Then the POS screen.
- Day 4: products/inventory/restock, customers khata and payments, vendors.
- Day 5: galla and Z-report, dashboard, login/signup/onboarding; agency-admin switches to the same components.
- Rules: keep every data-testid; screenshot before and after each screen into docs/ui/; run that screen's E2E tests after each screen; no copy changes except clarity. Stop and report each day.

DAY 6  Desktop
- New apps/desktop-online: Electron shell loading the cloud URL (env), single instance, tray, auto-start option, preload bridge for silent receipt printing (58/80 mm) and cash-drawer kick; falls back to the web app's offline queue when offline.
- apps/desktop (On-Premises): document the exact Windows build steps; the user builds the installer on Windows.

DAY 7  Staging
- Write deploy steps for the Oracle staging VPS from deploy/ and INSTALL.md; run the k6 scenarios in apps/bench against staging; record results in docs/plan/runs/bench-results.md.

Routing: Sonnet for logic, UI and tests; Haiku only for scouting, running checks and mechanical edits. Commit after every task. Never weaken a test assertion.
```
