import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Unit suite. Nest's dependency injection relies on `design:paramtypes` metadata, which esbuild
 * does not emit. SWC does, so every suite is compiled through it.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    name: 'unit',
    globals: true,
    environment: 'node',
    include: ['test/unit/**/*.spec.ts'],
  },
});
