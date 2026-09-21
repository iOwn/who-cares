---
name: refine
description: 'Refine a GitHub issue into an implementable spec — investigate the codebase, rewrite the issue body (What / Expected / Shape / Acceptance criteria), sharpen the title, set labels. Use when the user says "refine #N", "groom #N", "spec out #N", or asks to make a ticket ready for an agent.'
---

# Refine an issue

Turn a terse ticket into a spec another agent can implement without asking a
question. The refined issue is the single source of truth for the work; the
codebase is the single source of truth for the spec. Everything you write is
**anchored**: a claim about current behaviour names the file and symbol that
produce it.

Issue mechanics (`gh` commands, dependencies, wayfinder tickets) live in
`docs/agents/issue-tracker.md`.

## 1. Read the ticket

```bash
gh issue view <n> --json title,body,labels,assignees,comments
gh api repos/{owner}/{repo}/issues/<n> --jq '.issue_dependencies_summary'
```

Classify it — the class picks the body shape in step 4 and the labels in step 5:

- **bug** — something works wrong.
- **enhancement** — something new or changed.
- **decision** — the ticket asks which way to go. Refining it means writing the
  options with their trade-offs and a recommendation (the #142 shape), not a
  spec; it becomes an enhancement or bug ticket once the user has picked.
- **operator** — only a human with dashboard access can do it (Vercel env,
  Neon, branch protection). Refine it into a numbered checklist with the exact
  screens and values (the #95 shape).

A `wayfinder:*` ticket keeps its wayfinder label and body shape — refine its
content, not its type.

## 2. Investigate until anchored

This is the legwork; the spec is only as good as it. Done when **every surface
the change touches is named with its file**, and every "today it does X" has a
symbol behind it. For each ticket, sweep:

- **Every occurrence**, not the one the reporter saw. A "move the cancel
  button" ticket means grep every dialog, sheet, form and panel for a cancel
  affordance and tabulate them — the reporter's example is one row.
- **The primitive that owns the behaviour** (`src/ui/*`), and whether the fix
  belongs there (one edit, convention enforced) or at the call sites.
- **What already codifies the current behaviour**: `docs/design-system.md`,
  `docs/design-system-inventory.md`, `CONTEXT.md`, `SPEC.md`, `docs/adr/*`,
  stories. Drift the docs describe is a spec item; drift they forbid is a bug.
- **What depends on the current behaviour**: component tests, `e2e/*` selectors,
  `E2E_*` seeds, notification copy, migrations. Name what will need to change and
  what must stay untouched.
- **Neighbours that look in-scope but aren't** (a confirm dialog's footer
  Cancel next to a header Cancel; an inline form's Cancel that is not an overlay).
  They go in *Out of scope* with the reason, so the implementer does not "fix"
  them by analogy.
- For a **bug**: reproduce from the code path, name the root cause, and check
  whether it is one cause or several stacked (a fix that clears one symptom while
  another remains is the usual miss).

## 3. Decide

Resolve every ambiguity yourself with a one-line reason; the implementer gets
decisions, not options. Flag each decision in your reply so the user can veto.
Use `AskUserQuestion` only when the readings lead to materially different work
(a different data model, a different product behaviour) — not for naming,
placement or scope calls a careful colleague would make.

Where a choice is genuinely the implementer's, say so explicitly ("the
implementer's call, stated in the PR") rather than leaving it silent.

## 4. Write the body

Write the body to a scratchpad file and publish with `--body-file`, so it can be
re-read and re-published after a veto without reconstructing it. Keep the
reporter's original text at the top as a `> **Original ask**` blockquote — it is
the requirement; the rest is your reading of it.

Enhancement shape:

```
## What                — current behaviour, evidenced: a table of surfaces with
                         file + what each does today; which docs codify it
## Expected            — the target behaviour, concrete (label text, size, aria
                         name, where in the layout), and what stays unchanged
### Shape              — how to build it: new/changed files and symbols, which
                         layer owns it (domain / ui / app), patterns to reuse,
                         tests to add, docs + stories to update. Out of scope
                         items with reasons live here or in their own section.
## Acceptance criteria — checkboxes, each observable by a reviewer
## Blocked by          — issue refs, or "None."
```

Bug shape: `## Symptom` / `## Root cause` (file + line of the defect, stacked
causes numbered) / `## Fix` / `## Acceptance criteria` / `## Blocked by`.

Decision shape: `## Measured` (or `## What`) / `## Why this needs a decision` /
`## Options` (each with consequences) / `## Recommendation`. Operator shape: one
`## N.` section per step with the dashboard path and the value to enter, and a
checkbox to tick.

Acceptance criteria are **checkable and exhaustive**: one per behaviour in
*Expected*, one per must-stay-unchanged item, one naming the test file that
covers the change, and the standing last line — `pnpm test`, lint, typecheck and
the E2E smoke (`e2e.yml`) stay green. "Works correctly" is not a criterion;
"pressing ✕ closes the dialog and focus returns to the trigger" is.

## 5. Title and labels

- **Title** states the change, not the complaint: *"Dialog.Header: one dismiss
  affordance — trailing icon-only ✕"* over *"Cancel button on modal"*.
- **Type label** by class: bug → `bug`; enhancement → `enhancement`; operator →
  `help wanted`; decision → `question`; wayfinder tickets keep their
  `wayfinder:<type>`. Exactly one of these. `accessibility` and `documentation`
  are topic labels that sit alongside the type when that is the substance.
- **`ready-for-agent`** only on a bug or enhancement whose spec needs no further
  human decision *and* whose `issue_dependencies_summary.blocked_by` is 0. If a
  blocker exists, add the native dependency (issue-tracker.md "Blocking"), list
  it under *Blocked by*, and leave `ready-for-agent` off — the label is a promise
  that an agent can start now. Decision and operator tickets never carry it.

```bash
gh issue edit <n> --title "…" --body-file <scratch>/issue-<n>.md --add-label enhancement,ready-for-agent
```

## 6. Reply

Link the issue, then the decisions you made in step 3 with their reasons, then
anything you left for the implementer. The user is reading to veto, so lead with
the calls most likely to be contested.
