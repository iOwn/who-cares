import type { Story, StoryDefault } from "@ladle/react";
import type { ReactNode } from "react";
import { PersonChip } from "./PersonChip";

export default {
  title: "Primitives/PersonChip",
} satisfies StoryDefault;

function Row({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
      {children}
    </div>
  );
}

export const Default: Story = () => (
  <Row>
    <PersonChip name="Honi" isYou />
    <PersonChip name="Inki" />
  </Row>
);

export const Sizes: Story = () => (
  <Row>
    <PersonChip name="Honi" isYou size="sm" />
    <PersonChip name="Honi" isYou size="md" />
  </Row>
);
