import type { Story, StoryDefault } from "@ladle/react";
import type { ReactNode } from "react";
import { Surface } from "./Surface";

export default {
  title: "Primitives/Surface",
} satisfies StoryDefault;

function Stack({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gap: "0.75rem", maxWidth: "22rem" }}>{children}</div>;
}

const body = { padding: "0.75rem 1rem" } as const;

export const Variants: Story = () => (
  <Stack>
    <Surface variant="default" style={body}>
      Default — white card, hairline border.
    </Surface>
    <Surface variant="sunken" style={body}>
      Sunken — sits back into the page.
    </Surface>
    <Surface variant="danger" style={body}>
      Danger — an at-risk / escalating card.
    </Surface>
  </Stack>
);

export const Nested: Story = () => (
  <Surface variant="default" style={{ padding: "1rem", display: "grid", gap: "0.5rem" }}>
    <strong>Day detail</strong>
    <Surface variant="sunken" style={body}>
      A sunken Surface nested inside a default one.
    </Surface>
  </Surface>
);

/** `className` / `style` are forwarded and merged last — here `style` sets padding + a custom width. */
export const StyleEscapeHatch: Story = () => (
  <Surface variant="default" style={{ padding: "1.25rem", width: "16rem" }}>
    Caller `style` wins.
  </Surface>
);
