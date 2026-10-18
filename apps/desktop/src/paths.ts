import * as path from 'node:path';

export interface ResourcePaths {
  /** apps/server/dist/main.js equivalent */
  serverMain: string;
  /** Directory containing node_modules the server (and prisma CLI) resolve from */
  serverRoot: string;
  prismaSchema: string;
  prismaMigrationsDir: string;
  /** Next standalone server.js */
  clientServer: string;
  /** cwd for the client server process */
  clientDir: string;
}

/**
 * Packaged layout (electron-builder extraResources):
 *   <resources>/server/{dist,prisma,node_modules}
 *   <resources>/client/apps/client/server.js   (Next standalone, monorepo root = client/)
 * Dev layout: files straight from the repo build output.
 */
export function resolveResourcePaths(opts: {
  isPackaged: boolean;
  resourcesPath: string;
  /** apps/desktop/dist directory (where compiled main.js lives) */
  appDir: string;
}): ResourcePaths {
  if (opts.isPackaged) {
    const server = path.join(opts.resourcesPath, 'server');
    const client = path.join(opts.resourcesPath, 'client', 'apps', 'client');
    return {
      serverMain: path.join(server, 'dist', 'main.js'),
      serverRoot: server,
      prismaSchema: path.join(server, 'prisma', 'schema.prisma'),
      prismaMigrationsDir: path.join(server, 'prisma', 'migrations'),
      clientServer: path.join(client, 'server.js'),
      clientDir: client,
    };
  }
  const repo = path.resolve(opts.appDir, '..', '..', '..');
  const server = path.join(repo, 'apps', 'server');
  const client = path.join(repo, 'apps', 'client', '.next', 'standalone', 'apps', 'client');
  return {
    serverMain: path.join(server, 'dist', 'main.js'),
    serverRoot: server,
    prismaSchema: path.join(server, 'prisma', 'schema.prisma'),
    prismaMigrationsDir: path.join(server, 'prisma', 'migrations'),
    clientServer: path.join(client, 'server.js'),
    clientDir: client,
  };
}

export function buildDatabaseUrl(c: { user: string; password: string; port: number; database: string }): string {
  return `postgresql://${encodeURIComponent(c.user)}:${encodeURIComponent(c.password)}@127.0.0.1:${c.port}/${c.database}`;
}
