# DeepKhata Cloud desktop shell (Electron)

Thin Electron shell for the hosted app. It loads `CLOUD_URL` in a locked-down
window (no Node, no local server) and adds the two things a browser tab cannot
do reliably at a shop counter:

- **silent thermal printing** of the POS receipt (`window.deepkhata.printReceipt`)
- **cash-drawer kick** over ESC/POS (`window.deepkhata.openCashDrawer`)

Everything else — sales, stock, ledger, offline queue — is the cloud PWA. When
the network is down the shell does not invent a local mode: the app's own
service worker and offline queue take over, exactly like in a browser.

## Layout

| File | Purpose |
| --- | --- |
| `src/main.ts` | Lifecycle: single instance, window, tray, printing, drawer kick (only file that needs Electron besides `tray.ts`/`preload.ts`) |
| `src/preload.ts` | Exposes exactly `printReceipt` + `openCashDrawer` through `contextBridge` |
| `src/ipc.ts` | Channel names, HTML sanitising, the bridge factory and the IPC handlers (pure) |
| `src/printer.ts` | ESC/POS pulse, page sizing in microns, print document, raw-target resolution (pure) |
| `src/window-state.ts` | Remembers size/position, drops an off-screen position (pure) |
| `src/autostart.ts` | Start-with-Windows (login item) / Linux autostart entry (pure) |
| `src/settings.ts`, `src/cloud.ts`, `src/tray-menu.ts` | Printer choice + paper width, `CLOUD_URL` parsing, tray menu template (pure) |
| `src/tray.ts` | Tray icon wiring |

`userData` (Windows: `%APPDATA%\DeepKhata`) holds `settings.json`,
`window-state.json`, `device.json` and `logs/main.log`.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `CLOUD_URL` | `https://app.deepkhata.com` | URL the shell loads. Bare hostnames get `https://`. `NEXT_PUBLIC_CLOUD_URL` is also read. |
| `APP_NAME` | `DeepKhata` | Window title and tray tooltip. |

Set the real domain before building for release.

## Printing and drawer

The tray has **Receipt printer** (system default or a queue) and **Paper width**
(80 mm / 58 mm). Choices are saved per installation.

- Receipts print **silently** to the chosen queue; the page height is measured
  from the slip so it does not feed blank paper. If the printer fails, the POS
  falls back to the normal print dialog automatically.
- The drawer kick needs a queue that can take raw bytes. On Windows share the
  receipt printer (Printer properties → Sharing) and the shell writes
  `ESC @` + `ESC p 0 25 250` to `\\localhost\<share>`. On Linux/macOS point
  `drawerTarget` in `settings.json` at a device such as `/dev/usb/lp0`.

## Develop on Linux/macOS

```
npm run build -w desktop-online
npm test -w desktop-online      # vitest: preload/IPC, printer, window state, tray
CLOUD_URL=http://localhost:3000 npm run start -w desktop-online
```

## Build the Windows installer (on a Windows x64 machine)

1. `npm ci` at the repo root (installs Electron + electron-builder).
2. `set CLOUD_URL=https://app.<domain>` — baked into the shell at runtime via the
   environment, or leave the default.
3. `npm run dist -w desktop-online` — compiles `src/` and runs electron-builder
   (`win` → NSIS x64) into `apps/desktop-online/release/`.
4. `npm run dist:dir -w desktop-online` builds an unpacked folder for a quick check.

The installer is per-machine, allows choosing the folder, and creates a
DeepKhata shortcut. `Start with Windows` in the tray adds a login item
(`--hidden`, so it opens in the tray).

## Not included by design

No code signing, no auto-update, no merged on-prem + cloud binary. The on-prem
Shop Server stays in `apps/desktop`.
