import { defineConfig } from 'vitest/config';

/**
 * The end-to-end suite covers what a browser does with these pages. This one covers the pure logic
 * underneath them — the decisions that are cheap to get wrong and expensive to reach through a
 * browser, such as the shape of an outgoing request URL.
 */
export default defineConfig({
  test: {
    name: 'web-unit',
    globals: true,
    environment: 'node',
    include: ['test/unit/**/*.spec.ts'],
  },
});
