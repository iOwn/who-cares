/**
 * `NameCard` (issue #153) — the client half of the rename flow. The action is
 * mocked; what is asserted is the card's own contract:
 *
 *   1. Save is disabled until the *normalised* draft differs from the saved
 *      name — retyping the same name, or only adding whitespace, saves nothing;
 *   2. a successful save hands the raw draft to the action and settles the
 *      field on the name the server answered with;
 *   3. a `{ ok: false }` result surfaces as the field's error and clears on
 *      the next keystroke.
 */
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

const renameMemberAction = vi.fn(
  async (input: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> => ({
    ok: true,
    name: input.trim(),
  }),
);
const refresh = vi.fn();

vi.mock("next/navigation", () => ({ default: {}, useRouter: () => ({ refresh }) }));
vi.mock("./memberActions", () => ({
  renameMemberAction: (input: string) => renameMemberAction(input),
}));

const { NameCard } = await import("./NameCard");

test("Save stays disabled while the normalised draft equals the saved name", async () => {
  const screen = await render(<NameCard name="Alex" />);
  const field = screen.getByLabelText("Name");
  const save = screen.getByRole("button", { name: "Save" });

  await expect.element(save).toBeDisabled();

  await userEvent.fill(field, "  Alex  ");
  await expect.element(save).toBeDisabled();

  await userEvent.fill(field, "   ");
  await expect.element(save).toBeDisabled();

  await userEvent.fill(field, "Alex P");
  await expect.element(save).toBeEnabled();
});

test("saving hands the draft to the action and settles on the returned name", async () => {
  renameMemberAction.mockResolvedValueOnce({ ok: true, name: "Alex P" });
  const screen = await render(<NameCard name="Alex" />);
  const field = screen.getByLabelText("Name");

  await userEvent.fill(field, "  Alex   P ");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(renameMemberAction).toHaveBeenCalledWith("  Alex   P ");
  await expect.element(field).toHaveValue("Alex P");
  await expect.element(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(refresh).toHaveBeenCalled();
});

test("a rejected name shows the action's message as the field error, cleared on edit", async () => {
  renameMemberAction.mockResolvedValueOnce({ ok: false, error: "Enter a name." });
  const screen = await render(<NameCard name="Alex" />);
  const field = screen.getByLabelText("Name");

  await userEvent.fill(field, "Bailey");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  await expect.element(screen.getByText("Enter a name.")).toBeVisible();
  await expect.element(field).toHaveAttribute("aria-invalid", "true");

  await userEvent.fill(field, "Bailey B");
  await expect.element(screen.getByText("Enter a name.")).not.toBeInTheDocument();
});
