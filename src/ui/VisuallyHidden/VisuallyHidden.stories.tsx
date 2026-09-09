import type { Story, StoryDefault } from "@ladle/react";
import { VisuallyHidden } from "./VisuallyHidden";

export default {
  title: "Primitives/VisuallyHidden",
} satisfies StoryDefault;

/**
 * Decorator hint: inspect the accessibility tree (or use a screen reader) —
 * the sentence reads "3 days need someone for Carlito" to assistive tech even
 * though only "3" is visible.
 */
export const StaticSrOnlyText: Story = () => (
  <p>
    3 <VisuallyHidden>days need someone for Carlito</VisuallyHidden>
  </p>
);

/** `isFocusable` un-hides the content on keyboard focus — the skip-link pattern. */
export const FocusableSkipLink: Story = () => (
  <VisuallyHidden isFocusable>
    <a href="#main">Skip to content</a>
  </VisuallyHidden>
);
