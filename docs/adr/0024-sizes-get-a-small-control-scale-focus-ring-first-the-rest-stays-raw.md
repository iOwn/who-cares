# Sizes get a small control scale and focus-ring tokens; the rest stays raw

`src/ui/tokenUsage.test.ts` (PR #189) fails the build on raw colours, primitive tokens, unknown
`var(--x)` and raw lengths in spacing / radius / type / shadow / z-index / duration properties.
Component dimensions are unchecked because `tokens.css` has no size scale. Issue #190 asked whether
one is wanted. An audit of every raw length outside `tokens.css` and `.ladle` (2026-10-09) found 72
dimensions, 32 outline lines, 13 transforms and a handful of one-offs.

## Decision

**Tokenize only what is shared; leave one-offs raw; do not lint dimensions wholesale.**

1. **Focus ring first, as its own change.** Add `--focus-ring-width: 2px` and
   `--focus-ring-offset: 2px`, use them in all 16 focus-ring declarations (13 files; the `.focus-ring` class cannot be composed
   into a module's state selectors, so each keeps its own two lines), then add `outline` / `outline-offset` to `TOKENIZED_PROPERTY`.
2. **A small control-size scale** for sizes repeated across components: `--size-control-sm` (34px),
   `--size-control-md` (40px), plus `--size-icon-24` / `--size-icon-36`. This replaces the repeated
   control and touch-target heights (`2.5rem` alone is used 9 times in 7 files). Refined in #192:
   only values used by 2+ components get a token, so there is no `--size-control-lg` (its only
   consumer would be FAB's `3rem`, which stays raw).
3. **Everything else stays raw:** dots and pips, skeleton shapes (RouteSkeleton is ~12 of the 72) and
   container max-widths. A `--measure-*` set was considered, but it would cover only 5 uses in 5 files.
4. **The lint rule does not take dimensions wholesale.** Skeletons and one-off pips would need many
   `ALLOWED` entries. Instead (#192) the rule flags a raw width/height/min-/max- value only when it
   equals a `--size-*` token's value — "use the token when one exists".

## Alternatives considered

- **A full `--size-*` scale, every dimension migrated.** Most consistent, but most sizes are one-offs
  (avatar steps, skeleton bars, `32rem` page width), so the scale would be mostly single-use tokens.
- **Leave sizes alone, add only the TSX inline-style check.** Leaves the repeated control heights free
  to drift apart, and the focus-ring recipe is already copied 16 times.

## Consequences

- #190 is split: focus ring (1), control scale plus a narrow dimension rule (2 and 4), and the TSX
  inline-style check (`CalendarGrid`, `PullToRefresh`, `appIcon`: checked or exempted in `ALLOWED`).
- `docs/design-system.md` "Token model" gains the new categories when each part lands.
- Tokens are not added in this ADR; it records the direction only.
