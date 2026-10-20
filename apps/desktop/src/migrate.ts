import { spawn } from 'node:child_process';
import * as path from 'node:path';

/**
 * `prisma migrate deploy` using the Prisma CLI that ships next to the server.
 * Runs the CLI with Electron's own binary as Node (ELECTRON_RUN_AS_NODE) so no
 * system Node is required on the shop PC.
 */
export function runMigrations(opts: {
  serverRoot: string;
  schemaPath: string;
  databaseUrl: string;
  nodeBinary?: string;
  onLog?: (msg: string) => void;
}): Promise<void> {
  const log = opts.onLog ?? (() => undefined);
  let cli: string;
  try {
    const pkg = require.resolve('prisma/package.json', { paths: [opts.serverRoot] });
    cli = path.join(path.dirname(pkg), 'build', 'index.js');
  } catch {
    return Promise.reject(new Error(`Prisma CLI not found under ${opts.serverRoot}/node_modules`));
  }
  return new Promise<void>((resolve, reject) => {
    const child = spawn(opts.nodeBinary ?? process.execPath, [cli, 'migrate', 'deploy', '--schema', opts.schemaPath], {
      cwd: opts.serverRoot,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        DATABASE_URL: opts.databaseUrl,
        DIRECT_URL: opts.databaseUrl,
        PRISMA_HIDE_UPDATE_MESSAGE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const onData = (d: Buffer) => {
      out += d.toString();
      log(d.toString());
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`prisma migrate deploy failed (code ${code}): ${out.slice(-800)}`)),
    );
  });
}
