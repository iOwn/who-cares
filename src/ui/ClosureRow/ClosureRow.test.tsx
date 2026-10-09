/**
 * `ClosureRow` — asserts what the feature relies on: the conditional lines
 * (day count, reason), the two actions firing, and the disabled/aria wiring on
 * Remove. Layout is not asserted.
 */

import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { ClosureRow } from "./ClosureRow";

const base = { title: "Mon, Aug 4, 2026", kind: "Care at home" };

test("single day without a reason shows only the title and kind", async () => {
  const screen = await render(<ClosureRow {...base} onEdit={vi.fn()} onRemove={vi.fn()} />);
  await expect.element(screen.getByText("Mon, Aug 4, 2026")).toBeVisible();
  await expect.element(screen.getByText("Care at home")).toBeVisible();
  expect(screen.container.textContent).not.toContain("days");
});

test("range shows the day count and the reason verbatim", async () => {
  const screen = await render(
    <ClosureRow {...base} dayCount={5} reason="Summer break" onEdit={vi.fn()} onRemove={vi.fn()} />,
  );
  await expect.element(screen.getByText("5 days")).toBeVisible();
  await expect.element(screen.getByText("Summer break")).toBeVisible();
});

test("Edit and Remove call their handlers", async () => {
  const onEdit = vi.fn();
  const onRemove = vi.fn();
  const screen = await render(<ClosureRow {...base} onEdit={onEdit} onRemove={onRemove} />);
  await screen.getByRole("button", { name: "Edit" }).click();
  await screen.getByRole("button", { name: "Remove" }).click();
  expect(onEdit).toHaveBeenCalledTimes(1);
  expect(onRemove).toHaveBeenCalledTimes(1);
});

test("removeLabel is the Remove button's accessible name", async () => {
  const screen = await render(
    <ClosureRow {...base} removeLabel="Remove Aug 4 – 8" onEdit={vi.fn()} onRemove={vi.fn()} />,
  );
  await expect.element(screen.getByRole("button", { name: "Remove Aug 4 – 8" })).toBeVisible();
});

test("isRemoveDisabled disables Remove but not Edit", async () => {
  const screen = await render(
    <ClosureRow {...base} isRemoveDisabled onEdit={vi.fn()} onRemove={vi.fn()} />,
  );
  await expect.element(screen.getByRole("button", { name: "Remove" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Edit" })).toBeEnabled();
});
