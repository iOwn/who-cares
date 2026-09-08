import type { ComponentType } from "react";

/**
 * The shape a primitive expects from an `icon={...}` prop — the icon COMPONENT
 * (e.g. `icon={Info}` from `lucide-react`), never an element or a string
 * (docs/design-system.md "Icons"). Shared by the primitives that take one
 * (`Callout`, `EmptyState`, …) so the inline type isn't re-spelled each time.
 */
export type IconComponent = ComponentType<{
  size?: number | string;
  "aria-hidden"?: boolean | "true" | "false";
}>;
