import type { Story, StoryDefault } from "@ladle/react";
import { CalendarOff, Plus } from "lucide-react";
import { FAB } from "./FAB";

export default {
  title: "Primitives/FAB",
} satisfies StoryDefault;

/**
 * The FAB owns the amber `--color-highlight` role. Position is feature-owned —
 * these stories just drop it inline. `Tab` to it to see the focus ring.
 */
export const Default: Story = () => <FAB icon={Plus}>I&rsquo;m out</FAB>;

export const AlternateLabel: Story = () => <FAB icon={CalendarOff}>Add an absence</FAB>;

export const Disabled: Story = () => (
  <FAB icon={Plus} isDisabled>
    I&rsquo;m out
  </FAB>
);
