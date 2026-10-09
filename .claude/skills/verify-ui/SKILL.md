---
name: verify-ui
description: 'Check the screens a UI change touches on its PR preview — find the preview, sign in on it, screenshot the affected screens at phone and desktop widths, measure what screenshots cannot settle, report findings on the PR and fix real defects. Use after opening a PR that touches UI (src/ui, src/app tsx/css), or when asked to "verify the UI", "check the screens" or "look at the preview".'
---

# Verify UI on the PR preview

Unit and component tests do not render the real app (ADR-0009: no visual coverage), and Ladle
stories show components in isolation. Defects that exist only in composition — a sticky bar not
flush with the viewport, a sheet footer that bleeds, horizontal overflow at 390px, the inbox
switching to a side panel at `md` — reach a human unless the agent looks. This skill is the look.

It drives the **real app on the PR's Vercel preview**, through the same `E2E_TEST_MODE` seam the
E2E smoke uses (`docs/testing.md` § E2E smoke scope).

## 0. Preconditions

- `VERCEL_AUTOMATION_BYPASS_SECRET` is in the agent shell (`.claude/settings.local.json` `env`,
  issue #202). Confirm by **length only**: `[ -n "$VERCEL_AUTOMATION_BYPASS_SECRET" ] && echo
  "set (${#VERCEL_AUTOMATION_BYPASS_SECRET})"`. Never print, echo or log it, never put it in the
  PR comment, and do not open `.claude/settings.local.json` once it holds the secret.
- `pnpm test:browser:setup` has been run once (Chromium installed).
- The PR exists and its HEAD is pushed.

## 1. Gate — is there UI to look at?

```bash
gh pr diff <n> --name-only
```

Run only if the diff touches `src/ui/**`, or a `.tsx` / `.css` file under `src/app/` (not tests or
stories). Otherwise reply **"no UI change, skipped"** and stop. To get the scene list for a diff:

```bash
node -e 'import("./.claude/skills/verify-ui/matrix.mjs").then(m => console.log(m.scenesForDiff(process.argv.slice(1)).join(",")))' -- <path> <path>…
```

Empty output means skip. A shared primitive (`src/ui/**`), `globals.css`, `tokens.css` or
`layout.tsx` maps to every scene.

## 2. Find the preview

The deployment for the PR's **HEAD sha**:

```bash
gh api "repos/iOwn/who-cares/deployments?sha=<head-sha>" --jq '.[0].id'
gh api "repos/iOwn/who-cares/deployments/<id>/statuses" --jq '.[0] | "\(.state) \(.environment_url)"'
```

Require `state == success`; while it is `pending` / `in_progress`, poll (every ~30s). Use the
per-deploy `environment_url` (`https://…vercel.app`).

## 3. Wait for E2E to be idle

`e2e.yml` fires on the same `deployment_status`, and its global setup **seeds — truncates — the
shared Preview Neon branch**. Seeding underneath a running smoke breaks it. Before the first seed:

```bash
gh run list --workflow e2e.yml --limit 5 --json status,conclusion,createdAt
```

Wait until none is `in_progress` or `queued`. (Pass `--no-seed` to the helper to skip seeding if
you only need a re-look at an already-seeded preview.)

## 4. Capture

```bash
node .claude/skills/verify-ui/capture.mjs --url <preview> --out <scratchpad>/shots [--scenes a,b]
```

Per scene: viewport **390×844** (phone) and **1280×800** (desktop) — these straddle the `md`
(768px) breakpoint in `src/ui/breakpoints.ts` — each at scroll **top** and **bottom**. It writes
`<scene>__<width>__<scheme>__<scroll>.png` and `measurements.json`, and exits non-zero if a scene
failed to render (see `sceneError`).

Scenes: `sign-in`, `calendar-grid`, `calendar-list`, `day-detail`, `im-out`, `inbox`, `settings`,
`settings-household` (table + selectors in `scenes.mjs`; adding a screen is one entry).

**Dark mode is not captured by default.** `src/ui/tokens.css` leaves dark as a stub (#27), so a dark
shot is byte-identical to light. When dark lands, pass `--schemes light,dark` and make it the default
in `matrix.mjs`.

**States the seed does not have.** The seed has no absences or requests, so every day is quiet and
the inbox is empty. For a change to *pending / at-risk / resolved* rendering or the inbox with a
request, drive the absence → request → accept flow ad hoc (selectors in `e2e/smoke.spec.ts`),
screenshot the states you need, and say in your comment that you did.

## 5. Inspect

Read each PNG with the Read tool — look at the cells the diff can affect first, then skim the rest.
Use `measurements.json` for what the eye misses:

- `horizontalOverflow` / `offenders`: any horizontal scroll at 390 is a finding.
- `rects`: `[role="dialog"]`, `[class*="ActionBar"]`, `aside[aria-label]` against `viewport` — a
  fixed/sticky bar should sit flush with the viewport edges (`left ≈ 0`, `right ≈ viewport.width`,
  `bottom ≈ viewport.height`); a sheet footer narrower than the sheet is the #200 bug.
- `errors`: console / page errors during the scene.

Add ad-hoc `getBoundingClientRect` checks in a throwaway Playwright script in the scratchpad when
the change needs one the helper does not record.

## 6. Report

One comment on the PR:

```bash
gh pr comment <n> --body "<findings>"
```

Findings with the matrix cell (`im-out · 390 · bottom`) and the number that shows it, or
**"checked N cells across M scenes, no findings"**. Text only — `gh` cannot attach images, and the
screenshots stay in the scratchpad. A judgement call about design intent goes in the comment, not
into a fix.

## 7. Fix

Fix real defects on the branch through the normal commit flow, then — once the redeploy is green
(step 2) — re-run steps 3–5 for the affected scenes and update the comment. One re-check, not a loop.

## Guardrails

- **Never print the secret.** The helper redacts it from its own errors and attaches it per request
  to the preview origin only (not the whole browser context) so it cannot reach a third-party host.
- **Seeding truncates the shared Preview database.** The helper refuses any URL that is not
  `https://*.vercel.app`; production never has `E2E_TEST_MODE`, so the seam 404s there anyway.
- **Nothing generated is committed.** Screenshots and measurements go to the scratchpad via `--out`.
- The helper signs in as member `a` only. The magic-link email and passkey paths are not exercised
  (passkeys do not work on a preview — `docs/testing.md`).
