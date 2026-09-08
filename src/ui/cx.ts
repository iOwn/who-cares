/**
 * `cx` — the one class-merge helper for `src/ui/` (ADR-0010).
 *
 * It is `clsx`, aliased. There is no `tailwind-merge`: the library has no
 * utility classes to de-duplicate, only CSS-Module class references. `cva`
 * owns prop-driven variant → class mapping; `cx` composes the base class, the
 * `cva` output, and the caller's `className` (always merged LAST).
 */
export { clsx as cx } from "clsx";
