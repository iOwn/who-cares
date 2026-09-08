import type { Story, StoryDefault } from "@ladle/react";
import { SectionHeading } from "./SectionHeading";

export default {
  title: "Primitives/SectionHeading",
} satisfies StoryDefault;

export const Default: Story = () => (
  <div style={{ display: "grid", gap: "1rem", maxWidth: "22rem" }}>
    <SectionHeading>This week</SectionHeading>
    <SectionHeading>Waiting on you</SectionHeading>
    <SectionHeading>Closures</SectionHeading>
  </div>
);

/** `level` sets the element (`h2`–`h4`) without changing the look. */
export const Levels: Story = () => (
  <div style={{ display: "grid", gap: "1rem", maxWidth: "22rem" }}>
    <SectionHeading level={2}>Level 2 (default)</SectionHeading>
    <SectionHeading level={3}>Level 3</SectionHeading>
    <SectionHeading level={4}>Level 4</SectionHeading>
  </div>
);
