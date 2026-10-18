// Copies the already-built server and client into apps/desktop/stage/ so
// electron-builder can ship them as extraResources.
//
//   npm run build -w server && NEXT_PUBLIC_API_URL=http://127.0.0.1:5000 npm run build -w client
//   npm run stage -w desktop
//
// NEXT_PUBLIC_API_URL is baked into the client bundle at build time, so it must
// match the API port the desktop app picks (default 5000, see DESKTOP_API_PORT).
//
// Layout produced (matches src/paths.ts "packaged" layout):
//   stage/server/{dist,prisma,package.json,node_modules}
//   stage/client/apps/client/{server.js,.next/static,public,...}
//
// Server production deps are installed with `npm install --omit=dev`, followed
// by `prisma generate`. Run this on the Windows build machine so native modules
// (bcrypt, prisma engines) are fetched for win32-x64. UNTESTED on Windows.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..', '..', '..');
const stage = path.resolve(__dirname, '..', 'stage');
const serverSrc = path.join(repo, 'apps', 'server');
const clientSrc = path.join(repo, 'apps', 'client');

function need(p) {
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}. Build it first (see header of scripts/stage.js).`);
}
function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`);
}

need(path.join(serverSrc, 'dist', 'main.js'));
const standalone = path.join(clientSrc, '.next', 'standalone');
need(path.join(standalone, 'apps', 'client', 'server.js'));

fs.rmSync(stage, { recursive: true, force: true });

// server
const serverDst = path.join(stage, 'server');
fs.cpSync(path.join(serverSrc, 'dist'), path.join(serverDst, 'dist'), { recursive: true });
fs.cpSync(path.join(serverSrc, 'prisma'), path.join(serverDst, 'prisma'), { recursive: true });
const serverPkg = JSON.parse(fs.readFileSync(path.join(serverSrc, 'package.json'), 'utf8'));
const deps = { ...serverPkg.dependencies };
// The Prisma CLI is needed at runtime for `migrate deploy`.
const devPrisma = (serverPkg.devDependencies || {}).prisma;
if (devPrisma) deps.prisma = devPrisma;
fs.writeFileSync(
  path.join(serverDst, 'package.json'),
  JSON.stringify({ name: 'deepkhata-server-runtime', version: serverPkg.version, private: true, dependencies: deps }, null, 2),
);
run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], serverDst);
run('npx', ['prisma', 'generate', '--schema', path.join('prisma', 'schema.prisma')], serverDst);

// client (Next standalone: server.js lives under the monorepo-relative path)
const clientDst = path.join(stage, 'client');
fs.cpSync(standalone, clientDst, { recursive: true });
const appDst = path.join(clientDst, 'apps', 'client');
fs.cpSync(path.join(clientSrc, '.next', 'static'), path.join(appDst, '.next', 'static'), { recursive: true });
if (fs.existsSync(path.join(clientSrc, 'public'))) {
  fs.cpSync(path.join(clientSrc, 'public'), path.join(appDst, 'public'), { recursive: true });
}
console.log(`[stage] done -> ${stage}`);
