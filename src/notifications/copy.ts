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

/**
 * Copy for setting or clearing the household's Bundesland (issue #167,
 * ADR-0020) — sent under the existing catalogue event 11
 * `childcare-pattern-changed`, since it changes which days are childcare
 * days exactly as a pattern edit does. `stateName` is the German display
 * name (e.g. `"Bayern"`), or `null` when the setting was cleared.
 */
export function publicHolidaysChangedNotification(
  actorName: string,
  stateName: string | null,
): { title: string; body: string } {
  if (stateName) {
    return {
      title: "Public holidays turned on",
      body: `${actorName} set the household's state to ${stateName}. Its public holidays now show as closed days on the calendar.`,
    };
  }
  return {
    title: "Public holidays turned off",
    body: `${actorName} cleared the household's state. Public holidays no longer show automatically — add one as a closure if you need it.`,
  };
}
