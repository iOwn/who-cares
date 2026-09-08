import type { Story, StoryDefault } from "@ladle/react";
import type { ReactNode } from "react";
import { Spinner } from "./Spinner";

export default {
  title: "Primitives/Spinner",
} satisfies StoryDefault;

function Row({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>{children}</div>;
}

export const Sizes: Story = () => (
  <Row>
    <Spinner size="sm" />
    <Spinner size="md" />
    <Spinner size="lg" />
  </Row>
);

/** Inline with text — the calendar month-load case. */
export const Inline: Story = () => (
  <span
    style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}
  >
    <Spinner size="sm" label="Loading September" />
    Loading September…
  </span>
);

/** Block — centred in its own region (the inbox first paint). */
export const Block: Story = () => (
  <div style={{ display: "grid", placeItems: "center", height: "8rem", width: "16rem" }}>
    <Spinner size="lg" label="Loading requests" />
  </div>
);
