import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Path alias mirroring tsconfig's `@/*` -> `./src/*`, so tests and the domain
// modules can import `@/domain`, `@/testing/factories`, etc. under Vitest.
const srcDir = fileURLToPath(new URL('./src/', import.meta.url));
const alias = [{ find: /^@\//, replacement: srcDir }];

export default defineConfig({
  resolve: { alias },
  test: {
    // A single Vitest workspace project for now. The design-system effort (#39)
    // adds a second `browser` project (Playwright provider, Chromium) alongside
    // this one; keeping `projects` here makes that a pure addition.
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          // `.test.ts` only. `.test.tsx` is deliberately excluded: those files
          // are reserved for the future `browser` project (#39) and must not be
          // picked up by the node runner.
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.test.tsx', 'node_modules', 'dist', '.next'],
        },
      },
    ],
  },
});
