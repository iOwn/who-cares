import type { Story, StoryDefault } from "@ladle/react";
import type { ReactNode } from "react";
import { StatePill } from "./StatePill";

export default {
  title: "Primitives/StatePill",
} satisfies StoryDefault;

function Row({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
      {children}
    </div>
  );
}

/** One pill per status-vocabulary state, friendly label derived. */
export const States: Story = () => (
  <Row>
    <StatePill state="resolved" />
    <StatePill state="pending" />
    <StatePill state="at-risk" />
    <StatePill state="closed" />
  </Row>
);

export const Sizes: Story = () => (
  <Row>
    <StatePill state="pending" size="sm" />
    <StatePill state="pending" size="md" />
    <StatePill state="at-risk" size="sm" />
    <StatePill state="at-risk" size="md" />
  </Row>
);

/** `children` overrides the derived label. */
export const LabelOverride: Story = () => (
  <Row>
    <StatePill state="resolved">Inki is on pickup</StatePill>
    <StatePill state="closed">Daycare closed</StatePill>
  </Row>
);
