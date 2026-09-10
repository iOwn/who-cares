/**
 * Notification copy for the two settings events (issue #5 catalogue #11 + #12).
 *
 * Every other event builds its own copy at the point it is raised (the request
 * services, `atRiskEscalation`). These two are raised by thin Server Actions
 * (`src/app/settings/childcareActions.ts`) that hold no domain vocabulary, so
 * the wording lives here instead.
 *
 * Tone, like everywhere: plain, calm, factual — states the change and where to
 * see it, never urgency- or guilt-toned (SPEC.md "Notifications").
 */

import { CHILDCARE_PATTERN_CHANGED_EVENT, CLOSURE_ADDED_EVENT } from "@/domain";

export function patternChangedNotification(actorName: string): { title: string; body: string } {
  return {
    title: "The childcare pattern changed",
    body: `${actorName} updated which weekdays are childcare days. Check the calendar for how it affects upcoming pickups.`,
  };
}

export function closureAddedNotification(
  actorName: string,
  date: string,
): { title: string; body: string } {
  return {
    title: `Closure added for ${date}`,
    body: `${actorName} marked ${date} as closed — there's no childcare pickup that day.`,
  };
}

/** The `Notification.coalesceKey` for each settings event — one window per record. */
export function patternCoalesceKey(householdId: string): string {
  return `${CHILDCARE_PATTERN_CHANGED_EVENT}:${householdId}`;
}

export function closureCoalesceKey(householdId: string, date: string): string {
  return `${CLOSURE_ADDED_EVENT}:${householdId}:${date}`;
}
