import type { Story, StoryDefault } from "@ladle/react";
import { Button } from "../Button";
import { RouteHeader } from "./RouteHeader";

export default {
  title: "Primitives/RouteHeader",
} satisfies StoryDefault;

/**
 * Decorator hint: `Tab` to the back control to eyeball the composed
 * `IconButton`'s mandatory `[data-focus-visible]` ring (docs/design-system.md
 * §3).
 */
export const Default: Story = () => <RouteHeader title="Requests" onBack={() => {}} />;

export const WithTrailingAction: Story = () => (
  <RouteHeader
    title="Carlito's childcare"
    onBack={() => {}}
    trailing={
      <Button variant="ghost" size="sm">
        Edit
      </Button>
    }
  />
);

export const LongTitle: Story = () => (
  <div style={{ maxWidth: "20rem" }}>
    <RouteHeader title="A genuinely much longer route title than usual" onBack={() => {}} />
  </div>
);
