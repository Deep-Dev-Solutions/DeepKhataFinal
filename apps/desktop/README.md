# DeepKhata Shop Server (Electron)

Runs DeepKhata fully offline on the shop's main PC and serves other counters over the LAN.

On start the app: takes a single-instance lock, starts an embedded Postgres 17
(`<userData>/pgdata`, 127.0.0.1, random free port, fsync on), creates the `deepkhata`
database on first run, runs `prisma migrate deploy`, forks the Nest API and the Next
standalone client as utility processes, waits for `GET /health`, then opens a window.
Shutdown order: window, client, API, Postgres. Closing the window keeps it in the tray.

## Layout

| File | Purpose |
| --- | --- |
| `src/main.ts` | Lifecycle, process orchestration (the only file that needs Electron besides `tray.ts`) |
| `src/tray.ts` | Tray icon and menu (DB / API / sync status, Open, Backup now, LAN mode, Quit) |
| `src/licence/*` | Offline Ed25519 licence verification (pure) |
| `src/state.ts` | `state.json` with HMAC-protected `lastSeenAt` (pure) |
| `src/backup.ts` | `pg_dump` + gzip, rotation to 14 files (pure, injectable) |
| `src/lan.ts`, `src/ports.ts`, `src/health.ts`, `src/paths.ts`, `src/settings.ts`, `src/integrity.ts` | Small pure helpers |
| `src/postgres.ts`, `src/migrate.ts` | Embedded Postgres and Prisma wrappers |

Data lives in Electron's `userData` folder (`%APPDATA%\DeepKhata` on Windows): `pgdata/`,
`backups/`, `logs/main.log`, `licence.txt`, `state.json`, `settings.json`, `device.json`,
plus generated secrets (`db-secret`, `access-token-secret`, `refresh-token-secret`).

## Develop on Linux/macOS

```
npm run build -w server
NEXT_PUBLIC_API_URL=http://127.0.0.1:5000 npm run build -w client
npm run build -w desktop && npm test -w desktop
npm run start -w desktop        # needs a display; downloads the Electron binary on first install
```

Dev mode reads straight from `apps/server/dist` and `apps/client/.next/standalone`
(copy `apps/client/.next/static` and `apps/client/public` into
`.next/standalone/apps/client/` once, as Next requires for standalone output).

Ports: API prefers `DESKTOP_API_PORT` (default 5000), client `DESKTOP_CLIENT_PORT`
(default 3000); if taken a free port is used. `NEXT_PUBLIC_API_URL` is baked into the client
at build time, so it must point to the API's preferred port. See "Known gaps".

## Build the Windows installer (on a Windows x64 machine)

Two desktop apps ship from this repo: the on-prem **Shop Server** (`apps/desktop`,
this folder) and the **cloud shell** (`apps/desktop-online`). They are independent —
build only the one you need.

Prerequisites for both: Windows 10/11 x64, Node 22+, Git, and PowerShell. Open
PowerShell **in the repo root** for every command below.

### A. On-prem Shop Server (`apps/desktop`)

Extra prerequisite: PostgreSQL 17 installed (only `pg_dump.exe` is copied; the app
runs its own embedded database).

1. `npm ci` — installs Electron, electron-builder and the embedded-postgres win32 binaries.
2. `npm run build -w server`
3. `$env:NEXT_PUBLIC_API_URL="http://127.0.0.1:5000"; npm run build -w client`
   (the API URL is baked into the client, so it must be the port the app uses).
4. Copy `pg_dump.exe` and the DLLs it needs (`libpq.dll`, `libiconv-2.dll`,
   `libwinpthread-1.dll`, `libintl-9.dll`, `libssl-*.dll`, `libcrypto-*.dll`,
   `libzstd.dll`, `liblz4.dll`) from `C:\Program Files\PostgreSQL\17\bin` into
   `apps/desktop/build/pgtools/` (see the README inside that folder).
   embedded-postgres does not ship `pg_dump`; backups fail without it.
5. `npm run dist -w desktop` — compiles TypeScript, runs `scripts/stage.js`
   (server dist + prisma + production `node_modules` + Next standalone output into
   `stage/`), then electron-builder writes
   `apps/desktop/release/DeepKhata Setup <version>.exe` (NSIS, x64, per-machine).
6. Install and launch it: the tray must show `Database: running` and `API: running`,
   the window opens, and logging in works offline.

`npm run dist:dir -w desktop` builds an unpacked folder instead, which is faster
for checking that `stage/` is complete.

### B. Cloud shell (`apps/desktop-online`)

1. `npm ci` at the repo root.
2. Point it at your domain: either set `$env:CLOUD_URL="https://app.<domain>"` for a
   one-off build, or edit `DEFAULT_CLOUD_URL` in `apps/desktop-online/src/cloud.ts`
   so the installed app always uses it (an installed app has no env vars).
3. `npm run dist -w desktop-online` — compiles and writes
   `apps/desktop-online/release/DeepKhata Setup <version>.exe`.
4. Install, log in as the shop owner, then choose **Receipt printer** and
   **Paper width** from the tray. Share the printer in Windows so the cash-drawer
   kick can write to `\\localhost\<share>`.

The product name comes from `APP_NAME` at build time (default `DeepKhata`).

## Code signing

`build.win.sign` points to `scripts/sign.js`. It does nothing unless `CSC_LINK` is set, so
unsigned dev builds work. For releases, buy an OV/EV code-signing certificate and on the
build machine set `CSC_LINK` (path to .pfx), `CSC_KEY_PASSWORD`, optionally
`CSC_TIMESTAMP_URL`. EV or cloud-HSM certificates need the `signtool` call in the script
replaced by your provider's command. Never commit certificates or passwords.

## Licence

Token format: `<base64url(JSON payload)>.<base64url(Ed25519 signature over the payload segment)>`.
Stored in `userData/licence.txt`. The public key comes from env `LICENSE_PUBLIC_KEY_PEM` or
`src/licence/public-key.ts` (a dev placeholder, replace before release).

States: `valid`, `grace` (15 days after `expiresAt`), `expired`, `invalid`, `clock_rollback`
(clock earlier than the last seen time by more than a day, or `state.json` tampered with).
The main process passes the state to the API as `DESKTOP_LICENSE_STATE`; `expired`, `invalid`
and `clock_rollback` mean the API must be read-only (enforced server side). The licence is
re-evaluated hourly but the API only sees the state it was started with.

## Backups

On start and hourly, if the newest backup is older than 24 h, `pg_dump` runs and writes
`userData/backups/<APP_NAME>-YYYYMMDD-HHmm.sql.gz` (local time), keeping the newest 14.
"Backup now" in the tray does the same. `pg_dump` is looked up in `PG_DUMP_PATH`, then
`resources/pgtools/`, then `PATH`.

## Unclean shutdown

`userData/running.marker` exists while the app runs. If it is still there at start, a warning is
logged and `getIntegrityStatus().uncleanShutdown` is true (tray shows a warning). Running the
ledger verification (`npm run verify:ledger -w server`) automatically is a TODO.

## Deferred / not done

- Windows installer build, signing, auto-update (electron-updater), and Windows E2E: untested, no Windows machine yet.
- Bundling `pg_dump` (step 4 above) and verifying `stage.js` on Windows.
- Automatic ledger verification after an unclean shutdown.
- QR code on the LAN page (no QR library installed; URL text only).
- IPC/preload so the web UI can read licence and integrity status.
- Windows firewall prompt for LAN mode: the first run in LAN mode triggers the Windows Defender
  firewall dialog; the installer should add an inbound rule.

## Known gaps (need server/client follow-up)

- The API currently calls `app.listen(port)` without a host, so it listens on all interfaces even
  when LAN mode is off. `main.ts` passes `HOST`; the server must honour it.
- `NEXT_PUBLIC_API_URL` is build-time, so a client opened from another counter would call
  `127.0.0.1` on that counter. LAN mode needs the client to derive the API origin at runtime
  (e.g. `window.location.hostname` plus the API port) or a same-origin `/api` rewrite.
- The licence `deviceId` is checked against `userData/device.json`; the issuing flow must
  produce tokens for that id (shown in logs / to be exposed by the activation screen).
