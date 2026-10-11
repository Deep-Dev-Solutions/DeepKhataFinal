# Phase 10: Electron desktop ("Shop Server" edition)

**Goal:** a Windows installer that runs DeepKhata fully offline on the shop's main PC, serves other
counters over the shop LAN, and syncs to the cloud when internet is available.

## Architecture

- `apps/desktop` (Electron, TypeScript, `electron-builder`).
- Main process:
  1. Starts **embedded PostgreSQL** (`embedded-postgres` npm package) on `127.0.0.1` at a free port, data directory in `app.getPath('userData')/pgdata`. `fsync` stays on.
  2. Runs `prisma migrate deploy` with the bundled migrations on every start (safe because Phase 0 moved to migrations).
  3. Starts the Nest API (built `apps/server/dist`) in an Electron `utilityProcess` with env pointing at the local DB, `DEPLOYMENT_MODE=desktop`.
  4. Starts the Next client in `output: 'standalone'` mode as a second utility process (the client uses `middleware.ts` and dynamic routes, so static export is not an option without refactoring).
  5. Opens a `BrowserWindow` on `http://localhost:<clientPort>`.
- LAN mode (setting, off by default): bind API and client to `0.0.0.0`, show the shop-PC IP and a QR code so other counters open it in a browser; Windows Firewall rule added by the installer with consent.
- Tray icon: status (DB, API, sync), open app, backup now, quit.

## Desktop-specific server behaviour (`DEPLOYMENT_MODE=desktop`)

- Single tenant: the business is created at first run (or restored from cloud by login).
- Better Auth runs locally against the local DB (works offline; it's just tables).
- Scheduler jobs (dues reminders, register-not-closed) run locally; email channel queues until online.
- **Cloud sync worker:**
  - Outbox table populated by Prisma middleware or service hooks for every write (entity, id, op, payload, version).
  - When online, pushes outbox batches to the cloud API (`POST /sync/desktop/push`, authenticated with a device token) and pulls changes made elsewhere (owner's phone, other branches) via the Phase 9 delta pull.
  - Single-branch shops: desktop is the source of truth; cloud is backup + remote view.
  - Multi-branch: each desktop owns its branch's stock; cross-branch stock comes from the cloud and shows "as of HH:MM".

## Licensing

- Ed25519-signed licence token from the cloud: `businessId`, `plan`, `limits`, `expiresAt`, `deviceId`. Public key embedded in the app.
- Verified offline at start and hourly. Renewed online automatically. 15 days of offline grace after expiry, then read-only (same kill-switch UX).
- Store `lastSeenAt` (signed, encrypted) to detect clock rollback; if the system clock is behind `lastSeenAt` by more than 1 day, require an online check.

## Data safety

- Daily automatic `pg_dump` to `Documents/<APP_NAME> Backups` (keep 14), plus upload to the cloud when online.
- "Backup to USB" and "Restore from backup" in settings (restore requires owner password).
- On start after an unclean shutdown, run a quick integrity check (`verify-ledger.ts` in summary mode) and show a warning if anything is off.

## Distribution

- `electron-builder` NSIS installer for Windows 10/11 x64; auto-updates with `electron-updater` from GitHub Releases (private, token) or our own update server.
- Code-signing certificate required before giving it to customers (otherwise SmartScreen warnings). Leave a signing hook ready; the user buys the certificate.
- Measure RAM on a 4 GB Windows PC; target under 1 GB total for Electron + Postgres + API + client.

## Tests

- Playwright `_electron.launch()` suite on a Windows CI runner:
  - First run: DB initialised, business created, POS sale works with network disabled.
  - Upgrade: install vN, create data, update to vN+1 → migrations apply, data intact.
  - Crash safety: kill the process mid-checkout → restart → no partial order, ledger balanced.
  - LAN: second browser context on the LAN URL can sell; both see the same stock.
  - Sync: create sales offline → enable network → cloud tenant shows them, no duplicates.
  - Licence: expired licence + offline beyond grace → read-only.

## Acceptance criteria

- [ ] Installer works on a clean Windows 10 and 11 machine with no internet.
- [ ] A full day of shop activity offline syncs to the cloud correctly when connected.
- [ ] App survives power cuts without data loss (crash test passes 10/10).
- [ ] Auto-update from one version to the next works with migrations.
