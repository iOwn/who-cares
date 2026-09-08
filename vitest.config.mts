import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";

// Path alias mirroring tsconfig's `@/*` -> `./src/*`, so tests and the domain
// modules can import `@/domain`, `@/testing/factories`, etc. under Vitest.
const srcDir = fileURLToPath(new URL("./src/", import.meta.url));
const alias = [{ find: /^@\//, replacement: srcDir }];

export default defineConfig({
  test: {
    // Two Vitest projects, declared inline under `test.projects` — the standalone
    // `vitest.workspace.ts` file is deprecated in Vitest >=3 and removed in >=4.
    //
    // The file extension is the only selector; there is no path allow-list:
    //   *.test.ts  -> `node`    (plain TypeScript, environment: 'node')
    //   *.test.tsx -> `browser` (Vitest browser mode, Playwright, Chromium)
    //
    // `vitest run` executes both projects in one pass. See docs/testing.md and
    // ADR-0009.
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          // `.test.ts` only. `.test.tsx` belongs to the `browser` project below
          // and must not be picked up by the node runner.
          include: ["src/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "src/**/*.test.tsx"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "browser",
          // `.test.tsx` only — the narrow component-test tier of ADR-0009.
          include: ["src/**/*.test.tsx"],
          browser: {
            enabled: true,
            provider: playwright(),
            // Chromium only, matching the E2E browser matrix (ADR-0008).
            instances: [{ browser: "chromium" }],
            // Always headless, locally as well as in CI: `pnpm test` should
            // never pop a browser window. Use `pnpm test:watch` + the Vitest UI
            // when you want to look at the rendered DOM.
            headless: true,
            // The Chromium binary is not vendored — run `pnpm test:browser:setup`
            // (`playwright install chromium`) once after cloning.
          },
        },
      },
    ],
  },
});
