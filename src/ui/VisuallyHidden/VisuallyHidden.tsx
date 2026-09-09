"use client";

/**
 * `VisuallyHidden` — static screen-reader-only text
 * (docs/design-system.md "Component inventory": "Plus `VisuallyHidden`
 * (re-exported from RAC) for static SR-only text").
 *
 * A straight re-export of RAC's implementation — no wrapper, no local
 * styling, so there is nothing here to keep the Component Authoring Checklist
 * against beyond `'use client'` (it imports RAC directly). Use it for text
 * that must reach assistive tech but never renders visually (an icon-only
 * control's redundant label, a live count's units); RAC's `announce()` (see
 * `../announce`) is the right tool for TRANSIENT announcements instead.
 * `isFocusable` un-hides the content on keyboard focus — the skip-link
 * pattern.
 */
export { VisuallyHidden, type VisuallyHiddenProps } from "react-aria-components";
