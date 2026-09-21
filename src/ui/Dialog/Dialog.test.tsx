/**
 * `Dialog` — the ADR-0009 interaction / a11y contract for our RAC wrapper
 * (docs/design-system.md "Testing", docs/adr/0009-*). We assert only what our
 * wiring of RAC configures or could silently regress in a refactor — not RAC's
 * own focus-scope internals.
 *
 * Contract asserted (modal `center` + bottom `sheet`):
 *   1. focus moves INTO the dialog when it opens
 *   2. Escape closes it
 *   3. focus RESTORES to the trigger on close
 *   4. `role="dialog"` + `aria-modal="true"` + an accessible name, all wired
 *      through our wrapper (the name via `Dialog.Header`, and via a bare
 *      `aria-label` when there is no header)
 */

import { useState } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Button } from "../Button";
import { Dialog, DialogTrigger } from "./Dialog";

type Presentation = "center" | "sheet" | "fullscreen";

function Fixture({ presentation }: { presentation: Presentation }) {
  return (
    <DialogTrigger>
      <Button>Open dialog</Button>
      <Dialog presentation={presentation}>
        {({ close }) => (
          <>
            <Dialog.Header
              title="Trip details"
              trailing={
                <Button variant="ghost" onPress={close}>
                  Done
                </Button>
              }
            />
            <p>Where are you going?</p>
            <input aria-label="Destination" />
          </>
        )}
      </Dialog>
    </DialogTrigger>
  );
}

async function activeElementIsInside(el: Element) {
  await vi.waitFor(() => {
    expect(el.contains(document.activeElement)).toBe(true);
  });
}

// The ADR-0009 / #44 contract covers "modal + sheet", so every assertion below
// runs for both presentations.
for (const presentation of ["center", "sheet"] as const) {
  test(`${presentation}: focus moves in on open, Escape closes, focus restores to trigger`, async () => {
    const screen = await render(<Fixture presentation={presentation} />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });

    await userEvent.click(trigger);

    const dialog = screen.getByRole("dialog");
    await expect.element(dialog).toBeVisible();
    await activeElementIsInside(dialog.element());

    await userEvent.keyboard("{Escape}");

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
  });

  test(`${presentation}: dialog exposes role, aria-modal and an accessible name from Dialog.Header`, async () => {
    const screen = await render(<Fixture presentation={presentation} />);
    await userEvent.click(screen.getByRole("button", { name: "Open dialog" }));

    const dialog = screen.getByRole("dialog");
    await expect.element(dialog).toHaveAttribute("aria-modal", "true");
    await expect.element(dialog).toHaveAccessibleName("Trip details");
  });
}

test("a headerless dialog takes its accessible name from aria-label on our wrapper", async () => {
  const screen = await render(
    <DialogTrigger>
      <Button>Open</Button>
      <Dialog aria-label="Quick confirm">
        <p>Are you sure?</p>
      </Dialog>
    </DialogTrigger>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Open" }));

  await expect.element(screen.getByRole("dialog")).toHaveAccessibleName("Quick confirm");
});

// #132: `Dialog.Header closeButton` is the app-wide dismiss control. It reaches
// the overlay state through RAC context (no render-prop `close` involved), so we
// assert the wiring: one button named "Close", in the header, that closes the
// overlay and restores focus exactly like Escape does.
for (const presentation of ["center", "sheet"] as const) {
  test(`${presentation}: Dialog.Header closeButton renders one "Close" button that dismisses`, async () => {
    const screen = await render(
      <DialogTrigger>
        <Button>Open dialog</Button>
        <Dialog presentation={presentation}>
          <Dialog.Header title="Trip details" closeButton />
          <p>Where are you going?</p>
          <input aria-label="Destination" />
        </Dialog>
      </DialogTrigger>,
    );
    const trigger = screen.getByRole("button", { name: "Open dialog" });

    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    await expect.element(dialog).toBeVisible();

    const closeButtons = screen.getByRole("button", { name: "Close" });
    expect(closeButtons.elements()).toHaveLength(1);
    expect(dialog.element().querySelector("header")?.contains(closeButtons.element())).toBe(true);

    await userEvent.click(closeButtons);

    await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(trigger).toHaveFocus();
  });
}

// The real call sites (AbsenceForm, DayDetail) own the open state via
// `isOpen` / `onOpenChange` rather than a `DialogTrigger`; `closeButton` must
// reach that controlled state too, i.e. request a close through `onOpenChange`.
test("controlled: Dialog.Header closeButton requests a close through onOpenChange", async () => {
  function Controlled() {
    const [isOpen, setOpen] = useState(true);
    return (
      <Dialog presentation="sheet" isOpen={isOpen} onOpenChange={setOpen}>
        <Dialog.Header title="Trip details" closeButton />
        <p>Where are you going?</p>
      </Dialog>
    );
  }
  const screen = await render(<Controlled />);
  await expect.element(screen.getByRole("dialog")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Close" }));

  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
});

test("closing via the render-prop close() also restores focus to the trigger", async () => {
  const screen = await render(<Fixture presentation="sheet" />);
  const trigger = screen.getByRole("button", { name: "Open dialog" });

  await userEvent.click(trigger);
  await expect.element(screen.getByRole("dialog")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "Done" }));

  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();
});
