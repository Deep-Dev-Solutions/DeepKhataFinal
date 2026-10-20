export interface WaitForHealthOptions {
  timeoutMs?: number;
  intervalMs?: number;
  fetchFn?: (url: string) => Promise<{ ok: boolean }>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** Poll `url` until it answers 2xx or the timeout elapses (then throws). */
export async function waitForHealth(url: string, opts: WaitForHealthOptions = {}): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const intervalMs = opts.intervalMs ?? 500;
  const fetchFn = opts.fetchFn ?? ((u: string) => fetch(u));
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const deadline = now() + timeoutMs;
  let lastError = 'no response';
  for (;;) {
    try {
      const res = await fetchFn(url);
      if (res.ok) return;
      lastError = 'not ok';
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (now() >= deadline) throw new Error(`Timed out waiting for ${url} (${lastError})`);
    await sleep(intervalMs);
  }
}
