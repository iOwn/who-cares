import type { Story, StoryDefault } from "@ladle/react";
import { Bell, Check, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./Button";

export default {
  title: "Primitives/Button",
} satisfies StoryDefault;

/** Lay stories out in a wrapping row; nothing here is design-system styling. */
function Row({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
      {children}
    </div>
  );
}

/**
 * Decorator hint: `Tab` into any control below to eyeball the mandatory
 * `[data-focus-visible]` ring (docs/design-system.md §3). The Ladle a11y addon
 * also runs an axe pass on every story.
 */
export const Variants: Story = () => (
  <Row>
    <Button variant="primary">Save changes</Button>
    <Button variant="secondary">Today</Button>
    <Button variant="ghost">Cancel</Button>
    <Button variant="destructive">Decline</Button>
    <Button variant="dashed" fullWidth>
      <Plus size={16} aria-hidden /> Add a closure
    </Button>
  </Row>
);

export const Tones: Story = () => (
  <Row>
    <Button variant="ghost" tone="neutral">
      Neutral ghost
    </Button>
    <Button variant="ghost" tone="danger">
      Remove
    </Button>
    <Button variant="ghost" tone="accent">
      Review ›
    </Button>
    <Button variant="secondary" tone="danger">
      Remove device
    </Button>
    <Button variant="secondary" tone="accent">
      Details
    </Button>
  </Row>
);

export const Sizes: Story = () => (
  <Row>
    <Button size="md" variant="primary">
      Medium (default)
    </Button>
    <Button size="sm" variant="primary">
      Small
    </Button>
    <Button size="md" variant="secondary">
      Medium
    </Button>
    <Button size="sm" variant="secondary">
      Small
    </Button>
  </Row>
);

export const WithIcons: Story = () => (
  <Row>
    <Button variant="primary">
      <Check size={16} aria-hidden /> Accept
    </Button>
    <Button variant="destructive">
      <Trash2 size={16} aria-hidden /> Remove
    </Button>
    <Button variant="secondary">
      <Bell size={16} aria-hidden /> Notify me
    </Button>
  </Row>
);

export const FullWidth: Story = () => (
  <div style={{ maxWidth: "20rem" }}>
    <Button variant="primary" fullWidth>
      Confirm and continue
    </Button>
  </div>
);

export const Disabled: Story = () => (
  <Row>
    <Button variant="primary" isDisabled>
      Primary
    </Button>
    <Button variant="secondary" isDisabled>
      Secondary
    </Button>
    <Button variant="ghost" isDisabled>
      Ghost
    </Button>
    <Button variant="destructive" isDisabled>
      Destructive
    </Button>
  </Row>
);
