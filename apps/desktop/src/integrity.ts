import * as nodeFs from 'node:fs';
import * as path from 'node:path';

export const RUNNING_MARKER = 'running.marker';

export interface IntegrityFs {
  existsSync(file: string): boolean;
  writeFileSync(file: string, data: string): void;
  rmSync(file: string, opts: { force: true }): void;
  mkdirSync(dir: string, opts: { recursive: true }): void;
}

export interface IntegrityStatus {
  /** Previous run did not shut down cleanly (power cut, crash, kill). */
  uncleanShutdown: boolean;
  /** Set by the ledger check once implemented; null = not run. */
  ledgerOk: boolean | null;
}

let status: IntegrityStatus = { uncleanShutdown: false, ledgerOk: null };

/**
 * Call once at startup. If the marker from the previous run is still there the
 * app died without cleaning up: log a warning and set the flag. Then (re)create
 * the marker for this run.
 */
export function checkStartup(
  userDataDir: string,
  log: (level: 'info' | 'warn' | 'error', msg: string) => void,
  now: Date = new Date(),
  fs: IntegrityFs = nodeFs,
): IntegrityStatus {
  const marker = path.join(userDataDir, RUNNING_MARKER);
  const unclean = fs.existsSync(marker);
  if (unclean) {
    log('warn', `Unclean shutdown detected (marker ${RUNNING_MARKER} present). Ledger integrity check recommended.`);
    // TODO(phase-10): run the ledger verify script against the local DB and
    // set `ledgerOk` from its exit code. Command (from repo root):
    //   npm run verify:ledger -w server      (tsx apps/server/scripts/verify-ledger.ts)
    // In the packaged app this needs a compiled copy of that script in
    // resources/server/ and DATABASE_URL pointing at the embedded Postgres.
  }
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(marker, now.toISOString());
  status = { uncleanShutdown: unclean, ledgerOk: null };
  return status;
}

/** Call at the very end of a graceful shutdown. */
export function markCleanShutdown(userDataDir: string, fs: IntegrityFs = nodeFs): void {
  fs.rmSync(path.join(userDataDir, RUNNING_MARKER), { force: true });
}

/** Read by the UI / tray (exposed to the renderer via IPC later). */
export function getIntegrityStatus(): IntegrityStatus {
  return status;
}
