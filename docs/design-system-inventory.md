# Component inventory

The `src/ui/` library WhoCares builds, derived concretely from the 7 Toybox reference screens
(`.design/{Main,List,DayDetail,Inbox,ImOut,Recurring,Settings}.dc.html`, untracked) and the
`SPEC.md` feature list — not a generic "what an app needs" checklist. Settled on issue
[#30](https://github.com/iOwn/who-cares/issues/30); this doc is the assembled record of that
resolution.

**Planning-only, like the rest of the design system.** The prop sketches below are *rough* —
purpose, screens, variants, states, and an indicative prop list. The build effort turns each
into a final TypeScript signature following the conventions in
[`design-system.md`](./design-system.md) §"API & authoring conventions"; this doc does **not**
pin 22 signatures.

**Counts: 22 P0 primitives, 13 P1 feature-composed components.**

## Display state vs domain Day state

The domain `Day state` stays **exactly** `Resolved | Pending | At-risk | n/a` (`CONTEXT.md` and
code unchanged). The UI derives a **presentation-only** state via one `dayDisplayState()` mapper
in `src/ui`:

- `StatePill` / `StateDot` / `Legend`: `resolved | pending | at-risk | closed` — 4 meaningful
  states, friendly labels **Sorted / Waiting / At risk / Closed**.
- `DayCell` (grid): the 4 above + `quiet` (childcare day, nothing happening — the small grey
  dot) + `off` (weekday not in the pattern).
- `closed` = `n/a` caused by an explicit `Closure`; `off` = `n/a` for a non-pattern weekday.
  Neither is ever a domain state. `dayDisplayState()` is a pure function, unit-tested in the
  `node` Vitest project.

## P0 — primitives (fully specified)

### 1. Button

Every non-icon action. All screens.
Variants: `primary` (filled blue, 3px border, `--shadow-md`), `secondary` (white, border,
`--shadow-sm/md`), `ghost` (no border/bg — "Cancel", "Review ›", "Remove"), `destructive`
(red — "Decline", "Remove"), `dashed` (dashed outline, full-width — "+ Add a closure").
**No `highlight` variant** — the amber Today button uses blue `secondary`/`primary`; amber
lives only in `FAB`. Sizes `md` / `sm`. Modifiers: `fullWidth`, leading/trailing icon.
States: hover, `data-pressed` (translateY(2px) + shadow steps down one — the Toybox "press"),
`data-focus-visible` (visible ring `--color-focus-ring`), disabled.
Props sketch: `variant, size, fullWidth, isDisabled, onPress, children` + RAC `Button`
passthrough; `className`/`style` merged last; `ref` forwarded.

### 2. IconButton

Icon-only action, required `aria-label`. Main/List (bell, ‹ ›), Inbox/Settings (back).
Variants `secondary` (white tile + shadow), `ghost`. Sizes `md` (40px) / `sm` (34px). States
as Button. Props: `aria-label` (required), `variant, size, isDisabled, onPress, children`.

### 3. FAB

The floating "I'm out" action. Main, List. Own primitive: pill (`--radius-pill`), amber
`--color-highlight` fill, 3px `--color-border-strong`, `--shadow-lg`, **required** label +
**required** leading icon. **Position is feature-owned** (the calendar wraps it; the primitive
is not `position: fixed`). States: `data-pressed` (translateY + `lg→sm`), focus ring, hover.
Props: `icon, children` (label), `onPress, isDisabled`.

### 4. Surface

The bordered container ("card/tile"). Inbox cards, List rows, Settings closure rows, DayDetail
sheet body. Variants: `default` (white, `--color-border`, `--radius-lg`), `sunken`
(`--color-surface-sunken`), `danger` (`--color-at-risk-surface` + `--color-at-risk-solid`
border). No interactive behaviour — pressable rows compose `Surface` + a link/button.
Props: `as, variant, children`.

### 5. StatePill

Dot + label, tinted background. List rows, DayDetail header. States:
`resolved | pending | at-risk | closed`. Friendly labels Sorted / Waiting / At risk / Closed.
Props: `state, children` (label override), `size` (`sm|md` — the List/DayDetail delta is
padding).

### 6. StateDot

Bare coloured circle. Legend, nudge `Callout`, inline. Same 4 states.
Props: `state, size` (8/10px).

### 7. CountBadge

Numeric overlay, unrelated to day-state. Bell (Main/List/DayDetail). Red
`--color-at-risk-solid`, white text, `--color-bg` ring. Renders nothing at 0.
Props: `count, max` (e.g. `9+`).

### 8. Callout

Icon/dot + body, optional title / action / footnote. Main (at-risk nudge), ImOut (impact),
Recurring (preview), submit errors. Slots: `icon` | `dot`, optional `title`, `children`,
optional `action`, optional `footnote`. Props: `tone: "danger" | "info" | "neutral"`. Not
dismissable in v1. P1 `AbsenceImpact` / `RecurringPreview` are thin wrappers over it.

### 9. Dialog (+ Dialog.Header)

Modal overlay + bottom sheet. DayDetail (sheet), ImOut/Recurring (fullscreen), month-jump
(sheet/center). RAC `Modal` + `Dialog`. Prop
`presentation: "sheet" | "center" | "fullscreen"` — mobile as designed, desktop sheet/fullscreen
→ `center`. `Dialog.Header`: `leading` (dismiss — "Cancel" text or ✕) / `title` / `trailing`;
grabber handle only for `sheet`. States: open/closed, focus trap, Escape, scrim
(`--color-scrim`), focus restore. **The Inbox side-panel is NOT a Dialog** — it's feature
layout (fullscreen route on mobile, panel region on desktop).

### 10. SegmentedControl

2–n exclusive segments. Main/List (Grid/List), ImOut/Recurring (One-off/Recurring). Track
`--color-surface-track`, active segment white + `--shadow-tab`. Roving tabindex, arrow-key nav,
`data-selected`. Props: `value, onChange, children` (`<Segment>`).

### 11. TextField

Label + input + optional hint + error. ImOut/Recurring (Label), Settings. Folds in `Label`,
`FieldError`, the optional-flag ("— optional"). States: default, focus ring, invalid
(`aria-invalid` + `FieldError`), disabled, placeholder (`--color-text-placeholder`).
Props: `label, description, errorMessage, isRequired, isOptional, isDisabled` + RAC `TextField`
passthrough.

### 12. TextArea

Same wrapper as TextField, multi-line (Note field). Optional auto-grow.

### 13. DateField

Single date + calendar popover. ImOut (From/To as two independent DateFields), Settings
(Effective from). RAC `DatePicker`; popover portals to body at `--z-popover`.
Props: `label, value, onChange, minValue, maxValue, isDisabled, errorMessage`. `DateRangeField`
is P1.

### 14. ToggleGroup

Multi-select key row. Recurring + Settings ("Which weekdays"). Generic
(`selectionMode="multiple" | "single"`). Key: `--radius-md`, on-state `--color-accent` +
`--shadow-sm`. Roving tabindex. `WeekdayPicker` (P1) wraps it.
Props: `value, onChange, selectionMode, children` (`<Toggle>`).

### 15. Avatar

Member initial. Inbox request cards, PersonChip. **Monochrome** — ink initial on
`--color-accent-surface`, no per-member colour. Props: `name` (derives initial), `size`.

### 16. PersonChip

Avatar + name pill. ImOut/Recurring ("Who's out"). **Display-only in v1** — shows the filer;
the other member may be *shown* but never editable. Props: `member`.

### 17. SectionHeading

Uppercase Baloo, letterspaced, muted. List ("This week"), Inbox ("Waiting on you"), Settings
("Closures"). Props: `children`.

### 18. AppHeader

Wordmark + child subtitle + bell/count. Own primitive. Main, List. Content: `WhoCares`
wordmark, `"{child} · who's on pickup"` subtitle, trailing `IconButton` (bell) + `CountBadge`.
Props: `childName, requestCount, onOpenRequests`.

### 19. RouteHeader

Back `IconButton` + title. Own primitive. Inbox ("Requests"), Settings ("Carlito's
childcare"). Props: `title, onBack, trailing?`.

### 20. ActionBar

Sticky bottom container with gradient fade-in. ImOut, Recurring, Settings. Holds a full-width
primary Button. Props: `children`.

### 21. Spinner

Inline + block loading. Calendar month load, inbox load. Props: `size, label` (SR).

### 22. EmptyState

Icon + line + optional action. List (no notable days), Inbox (all caught up), first-run (no
pattern set). Props: `icon, title, description?, action?`.

## P1 — feature-composed (documented lighter, built with their features)

- **CalendarGrid** — the 7-col month grid. Composes `DayCell` ×35–42 + weekday header row; owns
  the 6-week layout and leading/trailing blanks. Calendar feature.
- **DayCell** — one grid day. Composes `StateDot` + state-icon badge + a "who" label. Display
  enum `resolved | pending | at-risk | closed | quiet | off`. `today` (heavy border +
  `--shadow-md`) is orthogonal to state. "who" label: assignee name / "asked {name}" / "both
  out" / "no one" / "closed". Pressable → opens DayDetail.
- **MonthPager** — ‹ · month label (opens MonthPicker) · › · Today. Composes `IconButton` ×2 +
  blue `Button` (Today) + a pressable label. Shared by Grid + List.
- **MonthPicker** — month/year grid body inside a `Dialog`.
- **Legend** — 4 × (`StateDot` + label). Grid + List.
- **ListRow** — one notable-day row. Composes `Surface` + colour rail + date + narrative line +
  `StatePill` + optional inline `Button` ("I'll get Carlito"). Grouped under `SectionHeading`
  ("This week" / "Next week" / "Later").
- **RequestCard** — inbox request. One component, variants `open` (avatar + "{name} is out ·
  {date}" + timing line + question + Accept/Decline `Button` row; sub-variant `escalating` =
  `Surface variant="danger"` + red timing) and `answered` (compact — status icon + "You
  accepted · {date}" + subline; `declined` dimmed).
- **FactList / FactRow** — DayDetail evidence list. `FactRow` = icon + key (bold) + value
  (muted), hairline top divider. Feature supplies the rows.
- **DateRangeField** — composes two `DateField`s + cross-field validation + the 4-week
  `maxValue` cap. ImOut, Recurring.
- **WeekdayPicker** — `ToggleGroup` specialised to Mon–Fri keys, weekday-typed value, starts
  blank (SPEC — no saved preference). Recurring, Settings.
- **ClosureRow** — Settings closure list item. Composes `Surface` + date chip + date/reason
  text + destructive "Remove" `Button`.
- **AbsenceImpact** — `Callout tone="info"` wrapper deriving "covers N childcare days, M
  requests fire". ImOut.
- **RecurringPreview** — `Callout tone="info"` wrapper (`title` + `footnote`) deriving the
  generated-absence date list + idempotency note. Recurring.

Screens / flows (`DayDetailSheet`, `AbsenceForm`, `InboxScreen`, `ChildcareSettings`) are
**features, not library components** — excluded from the inventory.

## The "Closed" affordance

A UI-only display state (`closed`), never a domain `Day state`. Surfaces on:

| Surface | Treatment |
| --- | --- |
| grid `DayCell` | striped bg + grey dot + generic "closed" line |
| `ListRow` | grey rail + `StatePill` "Closed" + generic narrative |
| `DayDetail` `Dialog` | grey `StatePill` + narrative **with the closure reason** if one was entered |
| `Legend` | 4th dot |
| Settings closure list | the reason verbatim (it edits the `Closure`, not day-state) |

Grid cell + list row keep a **generic** line; only `DayDetail` surfaces the free-text reason.

## Confirmed exclusions

1. **No Toast / transient-notification primitive** in v1. Feedback routing: validation → inline
   `FieldError` + RAC form summary; save success → navigate back to the calendar (the visible
   change is the confirmation), or an inline confirmation row for actions with no visual home
   (passkey enrolled, device revoked); submit / network error → `Callout tone="danger"` at the
   top of the form. Transient SR announcements go through `announce()` (see `design-system.md`
   §"API & authoring conventions" point 4) — a utility, not a visual component.
2. **No skeleton / full-page loading / dedicated error components in P0** — deferred to first
   feature need. P0 *does* include `Spinner` + `EmptyState` (the calendar and inbox both have a
   genuine first-paint empty/loading state in v1); error UI reuses `Callout tone="danger"`.

## Provenance

Assembled from the resolution of issue
[#30](https://github.com/iOwn/who-cares/issues/30) on the design-system wayfinder map
([#27](https://github.com/iOwn/who-cares/issues/27)). The `.design/*.dc.html` reference screens
it was read off are untracked.
