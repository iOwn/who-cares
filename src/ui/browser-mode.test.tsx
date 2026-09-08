/**
 * Smoke test for the `browser` Vitest project itself (#39) — not a component
 * test in the ADR-0009 sense.
 *
 * It proves the machinery end to end: a `.test.tsx` file is routed to the
 * `browser` project, Chromium boots under the Playwright provider, JSX compiles,
 * `vitest-browser-react` renders into a real DOM, and locator assertions
 * retry-and-pass. When a component test of a real primitive (`Dialog`,
 * `SegmentedControl`, `DateField`, `DateRangeField`) fails, this file is the
 * first thing to check: green here means the runner is fine and the failure is
 * the component's.
 *
 * The component under test is deliberately local and trivial — the tier's real
 * subjects arrive with their primitives.
 */
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";

function Greeting({ name }: { name: string }) {
  return (
    <section>
      <h1>Hello, {name}</h1>
      <button type="button">Wave back</button>
    </section>
  );
}

test("renders a React component into a real browser DOM", async () => {
  const screen = await render(<Greeting name="WhoCares" />);

  await expect.element(screen.getByRole("heading", { name: "Hello, WhoCares" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Wave back" })).toBeEnabled();
});
