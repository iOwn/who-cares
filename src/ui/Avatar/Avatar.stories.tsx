import type { Story, StoryDefault } from "@ladle/react";
import type { ReactNode } from "react";
import { Avatar } from "./Avatar";

export default {
  title: "Primitives/Avatar",
} satisfies StoryDefault;

function Row({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>{children}</div>;
}

export const Sizes: Story = () => (
  <Row>
    <Avatar name="Honi" size="sm" />
    <Avatar name="Honi" size="md" />
    <Avatar name="Honi" size="lg" />
  </Row>
);

/** Monochrome — every member gets the same colour pair. */
export const Monochrome: Story = () => (
  <Row>
    <Avatar name="Honi" />
    <Avatar name="Inki" />
    <Avatar name="Carlito" />
  </Row>
);

/** Decorative — `aria-hidden` when a sibling shows the name (as PersonChip does). */
export const Decorative: Story = () => (
  <Row>
    <Avatar name="Honi" aria-hidden />
    <span style={{ fontWeight: 800, fontSize: "0.875rem" }}>Honi</span>
  </Row>
);
