import type { Story, StoryDefault } from "@ladle/react";
import { ArrowLeft, Bell, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "./IconButton";

export default {
  title: "Primitives/IconButton",
} satisfies StoryDefault;

function Row({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>{children}</div>;
}

/** `Tab` through to eyeball the mandatory focus ring (docs/design-system.md §3). */
export const Variants: Story = () => (
  <Row>
    <IconButton aria-label="Notifications" variant="secondary">
      <Bell size={18} aria-hidden />
    </IconButton>
    <IconButton aria-label="Back" variant="ghost">
      <ArrowLeft size={18} aria-hidden />
    </IconButton>
  </Row>
);

export const Sizes: Story = () => (
  <Row>
    <IconButton aria-label="Previous month" size="md" variant="secondary">
      <ChevronLeft size={18} aria-hidden />
    </IconButton>
    <IconButton aria-label="Next month" size="sm" variant="secondary">
      <ChevronRight size={16} aria-hidden />
    </IconButton>
  </Row>
);

export const Disabled: Story = () => (
  <Row>
    <IconButton aria-label="Notifications" variant="secondary" isDisabled>
      <Bell size={18} aria-hidden />
    </IconButton>
    <IconButton aria-label="Back" variant="ghost" isDisabled>
      <ArrowLeft size={18} aria-hidden />
    </IconButton>
  </Row>
);
