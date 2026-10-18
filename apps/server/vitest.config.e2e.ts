import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [tsconfigPaths(), swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: './test/setup/global-setup.ts',
    setupFiles: ['./test/setup/env.ts'],
    fileParallelism: false,
    hookTimeout: 60000,
    testTimeout: 30000,
  },
});
