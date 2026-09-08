import type { Story, StoryDefault } from "@ladle/react";
import type { ReactNode } from "react";
import { StateDot } from "./StateDot";

export default {
  title: "Primitives/StateDot",
} satisfies StoryDefault;

function Row({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center" }}>
      {children}
    </div>
  );
}

export const States: Story = () => (
  <Row>
    <StateDot state="resolved" />
    <StateDot state="pending" />
    <StateDot state="at-risk" />
    <StateDot state="closed" />
  </Row>
);

export const Sizes: Story = () => (
  <Row>
    <StateDot state="at-risk" size="sm" />
    <StateDot state="at-risk" size="md" />
  </Row>
);

/** With `label` the dot is exposed to assistive tech as `role="img"`. */
export const Labelled: Story = () => (
  <Row>
    <StateDot state="pending" label="Waiting" />
    <span style={{ fontSize: "0.875rem" }}>Tue 8 Sep</span>
  </Row>
);
