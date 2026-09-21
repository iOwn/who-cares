import type { Story, StoryDefault } from "@ladle/react";
import { useState } from "react";
import { Button } from "../Button";
import { Dialog, DialogTrigger } from "./Dialog";

export default {
  title: "Primitives/Dialog",
} satisfies StoryDefault;

/**
 * Decorator hint: `Tab` into the trigger and open it, then `Tab` around inside
 * — focus is trapped, `Escape` closes, and focus returns to the trigger. The
 * mandatory focus ring (docs/design-system.md §3) shows on every control.
 *
 * Every header dismisses the same way (#132): `closeButton` renders the ghost,
 * icon-only ✕ on the right. Primary actions live in the body, never next to it.
 */
export const Center: Story = () => (
  <DialogTrigger>
    <Button>Jump to month</Button>
    <Dialog presentation="center">
      {({ close }) => (
        <>
          <Dialog.Header title="Jump to month" closeButton />
          <p>A centred modal card. Also the desktop form of a bottom sheet.</p>
          <Button variant="primary" onPress={close}>
            Go
          </Button>
        </>
      )}
    </Dialog>
  </DialogTrigger>
);

export const Sheet: Story = () => (
  <DialogTrigger>
    <Button variant="secondary">Open day detail</Button>
    <Dialog presentation="sheet">
      <Dialog.Header title="Thursday, 12 June" closeButton />
      <p>A bottom sheet with a grabber handle and rounded top corners.</p>
    </Dialog>
  </DialogTrigger>
);

/** Regression for #137: a long title must wrap, not collide with the close button. */
export const SheetLongTitle: Story = () => (
  <DialogTrigger>
    <Button variant="secondary">Open day detail (long title)</Button>
    <Dialog presentation="sheet">
      <Dialog.Header title="Wednesday, September 24, 2025" closeButton />
      <p>The title wraps to a second line instead of overflowing into the close button.</p>
    </Dialog>
  </DialogTrigger>
);

export const Fullscreen: Story = () => (
  <DialogTrigger>
    <Button variant="secondary">I'm out…</Button>
    <Dialog presentation="fullscreen">
      {({ close }) => (
        <>
          <Dialog.Header title="I'm out" closeButton />
          <p>An edge-to-edge form surface for the longer flows.</p>
          <Button variant="primary" onPress={close}>
            Save
          </Button>
        </>
      )}
    </Dialog>
  </DialogTrigger>
);

export const Controlled: Story = () => {
  const [isOpen, setOpen] = useState(false);
  return (
    <>
      <Button onPress={() => setOpen(true)}>Open (controlled)</Button>
      <Dialog
        presentation="center"
        isOpen={isOpen}
        onOpenChange={setOpen}
        aria-label="Controlled dialog"
      >
        <p>Open state is owned by the parent via `isOpen` / `onOpenChange`.</p>
        <Button variant="primary" onPress={() => setOpen(false)}>
          Close
        </Button>
      </Dialog>
    </>
  );
};

export const NotDismissable: Story = () => (
  <DialogTrigger>
    <Button variant="destructive">Delete closure</Button>
    <Dialog presentation="center" isDismissable={false} isKeyboardDismissDisabled>
      {({ close }) => (
        <>
          <Dialog.Header title="Delete this closure?" />
          <p>No scrim-click or Escape dismissal — the user must choose.</p>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <Button variant="ghost" onPress={close}>
              Keep
            </Button>
            <Button variant="destructive" onPress={close}>
              Delete
            </Button>
          </div>
        </>
      )}
    </Dialog>
  </DialogTrigger>
);
