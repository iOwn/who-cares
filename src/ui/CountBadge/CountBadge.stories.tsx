import type { Story, StoryDefault } from "@ladle/react";
import { Bell } from "lucide-react";
import type { ReactNode } from "react";
import { CountBadge } from "./CountBadge";

export default {
  title: "Primitives/CountBadge",
} satisfies StoryDefault;

function Row({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "1.25rem", alignItems: "center" }}>
      {children}
    </div>
  );
}

export const Counts: Story = () => (
  <Row>
    <CountBadge count={1} />
    <CountBadge count={2} />
    <CountBadge count={9} />
    <CountBadge count={12} />
    <CountBadge count={40} max={20} />
  </Row>
);

/** `count <= 0` renders nothing — the surrounding layout must not reserve space. */
export const Zero: Story = () => (
  <Row>
    <span>before</span>
    <CountBadge count={0} />
    <span>after</span>
  </Row>
);

/** Overlaid on a control — the `--color-bg` ring keeps it legible. */
export const OnAControl: Story = () => (
  <span style={{ position: "relative", display: "inline-flex" }}>
    <Bell size={22} aria-hidden />
    <span style={{ position: "absolute", top: "-0.5rem", right: "-0.6rem" }}>
      <CountBadge count={3} aria-label="3 unread requests" />
    </span>
  </span>
);
