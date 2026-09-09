import type { Story, StoryDefault } from "@ladle/react";
import type { ReactNode } from "react";
import { Button } from "../Button";
import { ActionBar } from "./ActionBar";

export default {
  title: "Primitives/ActionBar",
} satisfies StoryDefault;

/** A fixed-height scroll frame so the gradient fade-in has something to signal. */
function ScrollFrame({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        height: "16rem",
        maxWidth: "24rem",
        overflow: "auto",
        border: "1px dashed var(--color-border)",
        borderRadius: "var(--radius-lg)",
      }}
    >
      <div style={{ padding: "1rem", display: "grid", gap: "0.5rem" }}>
        <p>Scrollable form content above the bar…</p>
        <p>Keep scrolling to see the sticky bar stay put.</p>
        <p>More content.</p>
        <p>Even more content.</p>
        <p>Still more content.</p>
      </div>
      {children}
    </div>
  );
}

export const Default: Story = () => (
  <ScrollFrame>
    <ActionBar>
      <Button variant="primary" fullWidth>
        Save changes
      </Button>
    </ActionBar>
  </ScrollFrame>
);
