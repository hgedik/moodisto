import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Integration suite. Every file drives the real Nest application against the dedicated test
 * database and truncates it between tests, so the files must not run at the same time:
 * `fileParallelism` is a root-level option and has no effect inside a project definition.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    name: 'integration',
    globals: true,
    environment: 'node',
    include: ['test/integration/**/*.spec.ts'],
    globalSetup: ['./test/integration/global-setup.ts'],
    setupFiles: ['./test/integration/setup.ts'],
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
