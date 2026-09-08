/**
 * `announce()` — transient screen-reader announcements, as a function, not a
 * hook (docs/design-system.md "API & authoring conventions" §4). This is where
 * success / error feedback goes: WhoCares ships no Toast primitive.
 *
 * It re-exports `@react-aria/live-announcer` (a small standalone package in the
 * RAC ecosystem, also transitive via `react-aria-components`). That module
 * lazily mounts its own visually-hidden live region to `document.body` on first
 * call — no provider, no layout wiring.
 *
 * The one deviation from the upstream API: our default politeness is `'polite'`
 * (upstream defaults to `'assertive'`), matching the documented signature
 * `announce(message, politeness = 'polite', timeout?)`. Pass `'assertive'`
 * explicitly for genuinely interrupting messages (e.g. a submit failure).
 */
import {
  announce as ariaAnnounce,
  clearAnnouncer,
  destroyAnnouncer,
} from "@react-aria/live-announcer";

export type Politeness = "polite" | "assertive";
export type AnnounceMessage = string | { "aria-labelledby": string };

/** Announce `message` to assistive technology via a shared live region. */
export function announce(
  message: AnnounceMessage,
  politeness: Politeness = "polite",
  timeout?: number,
): void {
  ariaAnnounce(message, politeness, timeout);
}

export { clearAnnouncer, destroyAnnouncer };
