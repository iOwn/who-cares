/**
 * `SegmentedControl` — the ADR-0009 interaction / a11y contract for our RAC
 * wrapper (docs/design-system.md "Testing", docs/adr/0009-*).
 *
 * Contract asserted:
 *   1. correct roles — the group is a `radiogroup`, each segment a `radio`
 *   2. selection reflects `value` — the segment named by `value` is checked,
 *      and a controlled `value` change moves the checked state
 *   3. arrow-key roving tabindex — only one segment is in the tab order;
 *      ArrowRight/ArrowLeft move focus AND selection, and the roving
 *      `tabindex` follows
 */
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { SegmentedControl } from "./SegmentedControl";

function ControlledFixture({ onChange }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState("grid");
  return (
    <>
      <SegmentedControl
        aria-label="View"
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      >
        <SegmentedControl.Item value="grid">Grid</SegmentedControl.Item>
        <SegmentedControl.Item value="list">List</SegmentedControl.Item>
        <SegmentedControl.Item value="agenda">Agenda</SegmentedControl.Item>
      </SegmentedControl>
      <output data-testid="value">{value}</output>
    </>
  );
}

test("renders a radiogroup of radios", async () => {
  const screen = await render(<ControlledFixture />);

  await expect.element(screen.getByRole("radiogroup", { name: "View" })).toBeVisible();
  await expect.element(screen.getByRole("radio", { name: "Grid" })).toBeInTheDocument();
  await expect.element(screen.getByRole("radio", { name: "List" })).toBeInTheDocument();
  await expect.element(screen.getByRole("radio", { name: "Agenda" })).toBeInTheDocument();
});

test("selection reflects value", async () => {
  const screen = await render(
    <SegmentedControl aria-label="View" value="list" onChange={() => {}}>
      <SegmentedControl.Item value="grid">Grid</SegmentedControl.Item>
      <SegmentedControl.Item value="list">List</SegmentedControl.Item>
    </SegmentedControl>,
  );

  await expect.element(screen.getByRole("radio", { name: "List" })).toBeChecked();
  await expect.element(screen.getByRole("radio", { name: "Grid" })).not.toBeChecked();
});

test("a controlled value change moves the checked segment", async () => {
  const screen = await render(<ControlledFixture />);
  const grid = screen.getByRole("radio", { name: "Grid" });
  const list = screen.getByRole("radio", { name: "List" });

  await expect.element(grid).toBeChecked();

  await userEvent.click(screen.getByText("List", { exact: true }));

  await expect.element(list).toBeChecked();
  await expect.element(grid).not.toBeChecked();
  await expect.element(screen.getByTestId("value")).toHaveTextContent("list");
});

test("arrow keys move focus + selection with a roving tabindex", async () => {
  const onChange = vi.fn();
  const screen = await render(<ControlledFixture onChange={onChange} />);
  const grid = screen.getByRole("radio", { name: "Grid" });
  const list = screen.getByRole("radio", { name: "List" });

  // Only the selected segment is tabbable to start.
  await expect.element(grid).toHaveAttribute("tabindex", "0");
  await expect.element(list).toHaveAttribute("tabindex", "-1");

  await userEvent.tab();
  await expect.element(grid).toHaveFocus();

  await userEvent.keyboard("{ArrowRight}");

  await expect.element(list).toHaveFocus();
  await expect.element(list).toBeChecked();
  await expect.element(list).toHaveAttribute("tabindex", "0");
  await expect.element(grid).toHaveAttribute("tabindex", "-1");
  expect(onChange).toHaveBeenLastCalledWith("list");

  await userEvent.keyboard("{ArrowLeft}");

  await expect.element(grid).toHaveFocus();
  await expect.element(grid).toBeChecked();
  expect(onChange).toHaveBeenLastCalledWith("grid");
});
