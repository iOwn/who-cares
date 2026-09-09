import type { Story, StoryDefault } from "@ladle/react";
import { AppHeader } from "./AppHeader";

export default {
  title: "Primitives/AppHeader",
} satisfies StoryDefault;

/**
 * Decorator hint: `Tab` to the bell to eyeball the composed `IconButton`'s
 * mandatory `[data-focus-visible]` ring (docs/design-system.md §3).
 */
export const Default: Story = () => (
  <AppHeader childName="Carlito" requestCount={0} onOpenRequests={() => {}} />
);

export const WithPendingRequests: Story = () => (
  <AppHeader childName="Carlito" requestCount={3} onOpenRequests={() => {}} />
);

/** Counts above `CountBadge`'s default cap render as "9+". */
export const ManyRequests: Story = () => (
  <AppHeader childName="Carlito" requestCount={14} onOpenRequests={() => {}} />
);

export const LongChildName: Story = () => (
  <div style={{ maxWidth: "20rem" }}>
    <AppHeader childName="Bartholomew Alexander" requestCount={1} onOpenRequests={() => {}} />
  </div>
);
