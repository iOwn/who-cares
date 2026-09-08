import type { Story, StoryDefault } from "@ladle/react";
import { Legend } from "./Legend";

export default {
  title: "Primitives/Legend",
} satisfies StoryDefault;

export const Default: Story = () => (
  <div style={{ maxWidth: "22rem" }}>
    <Legend />
  </div>
);

export const MediumDots: Story = () => (
  <div style={{ maxWidth: "22rem" }}>
    <Legend size="md" />
  </div>
);

/** A subset, in a caller-chosen order. */
export const Subset: Story = () => (
  <div style={{ maxWidth: "22rem" }}>
    <Legend states={["at-risk", "pending", "resolved"]} />
  </div>
);
