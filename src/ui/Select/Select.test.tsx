/**
 * `Select` component test — the fifth ADR-0009 interaction/a11y contract
 * (docs/design-system.md "Testing", ADR-0009). Asserts ONLY behaviour our
 * wiring of RAC's `Select` configures and could regress silently in a
 * refactor: opening the listbox, selecting an option closes it and reports
 * the value, and the trigger is correctly associated with its label.
 *
 * RAC composes the trigger's accessible name from its current value AND the
 * field label (`aria-labelledby` lists both, e.g. `"None Bundesland"`), so
 * every query below matches the label as a substring via `/Bundesland/`, not
 * the whole name.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { Select } from "./Select";

afterEach(cleanup);

const OPTIONS = [
  { value: "BW", label: "Baden-Württemberg" },
  { value: "BY", label: "Bayern" },
  { value: "BE", label: "Berlin" },
] as const;

describe("Select", () => {
  test("the trigger is associated with its label", async () => {
    const screen = await render(<Select label="Bundesland" options={OPTIONS} />);
    await expect.element(screen.getByRole("button", { name: /Bundesland/ })).toBeInTheDocument();
  });

  test("opens the listbox, selects an option, closes, and reports the new value", async () => {
    const onChange = vi.fn();
    const screen = await render(
      <Select label="Bundesland" placeholder="None" options={OPTIONS} onChange={onChange} />,
    );

    await screen.getByRole("button", { name: /Bundesland/ }).click();
    await expect.element(screen.getByRole("listbox")).toBeInTheDocument();

    await screen.getByRole("option", { name: "Bayern" }).click();

    expect(onChange).toHaveBeenCalledWith("BY");
    await expect.element(screen.getByRole("listbox")).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: /Bundesland/ }))
      .toHaveTextContent("Bayern");
  });

  test("a controlled value renders as the trigger's text", async () => {
    const screen = await render(<Select label="Bundesland" options={OPTIONS} value="BE" />);
    await expect
      .element(screen.getByRole("button", { name: /Bundesland/ }))
      .toHaveTextContent("Berlin");
  });

  test("an empty value shows the placeholder", async () => {
    const screen = await render(
      <Select label="Bundesland" placeholder="None" options={OPTIONS} value={null} />,
    );
    await expect
      .element(screen.getByRole("button", { name: /Bundesland/ }))
      .toHaveTextContent("None");
  });
});
