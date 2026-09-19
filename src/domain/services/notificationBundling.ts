/**
 * Per-action notification bundling (issue #131, ADR-0018).
 *
 * The rule the whole notification pipeline now rests on: **the unit of
 * notification is the user action, not the record.** One action produces at
 * most one notification per `(recipient, event)` — so cancelling a two-week
 * absence is one mail, not ten, and a cron tick that finds ten newly at-risk
 * days is one mail per parent, not ten.
 *
 * This module is the pure half of that rule: given the notifications one action
 * produced, group them by `(recipientId, event)` and collapse each group of two
 * or more into a single count-aware notification. A group of one passes through
 * **untouched** — the per-day copy the domain services already write is better
 * than anything a bundler could synthesise, and singles are the common case.
 *
 * It is applied at exactly one place, `dispatchAll`
 * (`src/notifications/dispatch.ts`), which is the choke point every action's
 * notifications already flow through — so cancel / shorten, `claimDay`, the
 * batch inbox answer and the daily cron are all covered without any of them
 * knowing about bundling.
 *
 * Bundled copy is deliberately its own voice: name-free (a two-parent
 * household has exactly one "other parent") and date-list-bearing, built from
 * each notification's optional `subjectLabel` so a digest keeps its days
 * instead of degrading to a bare count. Tone is the same as everywhere — plain,
 * calm, factual, never urgency- or guilt-toned (SPEC.md "Notifications").
 *
 * Framework-free and pure (ADR-0005): notifications in, notifications out.
 */

import type { Notification } from "../ports";
import { ASSIGNMENT_STANDS_EVENT } from "./absenceCancellation";
import { DIRECT_CLAIM_EVENT } from "./directClaim";
import {
  CHILDCARE_PATTERN_CHANGED_EVENT,
  CLOSURE_ADDED_EVENT,
  DAY_AT_RISK_BOTH_ABSENT_EVENT,
  DAY_AT_RISK_ESCALATED_EVENT,
} from "./notificationCatalogue";
import { PICKUP_REQUEST_RECEIVED_EVENT } from "./pickupRequestGeneration";
import {
  PICKUP_REQUEST_ACCEPTED_EVENT,
  PICKUP_REQUEST_DECLINED_EVENT,
  PICKUP_REQUEST_WITHDRAWN_EVENT,
} from "./pickupRequestResolution";

/** How many `subjectLabel`s a bundled body lists before it says "and N more". */
export const MAX_LISTED_SUBJECTS = 5;

/**
 * `"a"` / `"a and b"` / `"a, b and c"` / `"a, b, c, d, e and 4 more"` — the day
 * list a bundled body carries. `""` when the group had no `subjectLabel`s at
 * all (the caller then drops the list clause entirely).
 */
export function listSubjects(labels: readonly string[]): string {
  if (labels.length === 0) return "";
  if (labels.length <= MAX_LISTED_SUBJECTS) {
    if (labels.length === 1) return labels[0];
    return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  }
  const shown = labels.slice(0, MAX_LISTED_SUBJECTS).join(", ");
  return `${shown} and ${labels.length - MAX_LISTED_SUBJECTS} more`;
}

/**
 * Bundled copy for one event. `days` is `listSubjects(...)` — already formatted,
 * and `""` when the event carries no subject labels, which each builder handles
 * by dropping the clause rather than emitting a dangling colon.
 */
interface BundleCopy {
  title(count: number): string;
  body(count: number, days: string): string;
}

/** ` on 2025-01-08 and 2025-01-09` — the clause a body appends when it has days. */
function onDays(days: string): string {
  return days ? ` on ${days}` : "";
}

/**
 * One entry per catalogue event (`NOTIFICATION_EVENTS`) — `catalogue.test.ts`
 * pins that none is missing, so `FALLBACK_COPY` below stays a true safety net
 * rather than a silent default.
 *
 * Events 1 and 11 never actually bundle in practice — event 1 is already one
 * digest per action, and two pattern saves are two separate actions (ADR-0018
 * accepts that as two facts). They carry copy anyway so the catalogue has no
 * holes.
 */
const BUNDLE_COPY: Readonly<Record<string, BundleCopy>> = {
  [PICKUP_REQUEST_RECEIVED_EVENT]: {
    title: (count) => `You were asked to cover ${count} pickups`,
    body: (count, days) =>
      `The other parent is out and asked you to cover pickup${onDays(days)}. Open the app to accept or decline each of the ${count} days.`,
  },
  [PICKUP_REQUEST_ACCEPTED_EVENT]: {
    title: (count) => `${count} of your pickup requests were accepted`,
    body: (count, days) =>
      `The other parent is covering pickup${onDays(days)} — ${count} days in all. Those days are settled.`,
  },
  [PICKUP_REQUEST_DECLINED_EVENT]: {
    title: (count) => `${count} of your pickup requests were declined`,
    body: (count, days) =>
      `The other parent can't cover pickup${onDays(days)}. Those ${count} days need a direct claim now.`,
  },
  [PICKUP_REQUEST_WITHDRAWN_EVENT]: {
    title: (count) => `${count} pickup requests were withdrawn`,
    body: (count, days) =>
      `${count} pickup requests${onDays(days)} no longer need an answer. Check the calendar for where those days stand.`,
  },
  [DIRECT_CLAIM_EVENT]: {
    title: (count) => `You're off pickup for ${count} days`,
    body: (count, days) =>
      `The other parent claimed pickup${onDays(days)}, so you're no longer down for those ${count} days.`,
  },
  [ASSIGNMENT_STANDS_EVENT]: {
    title: (count) => `You're still on pickup for ${count} days`,
    body: (count, days) =>
      `An absence changed, but the ${count} pickups you accepted${onDays(days)} still stand.`,
  },
  [DAY_AT_RISK_BOTH_ABSENT_EVENT]: {
    title: (count) => `${count} pickups need a plan`,
    body: (count, days) =>
      `You're both marked away${onDays(days)} and no one is down for pickup on those ${count} days. One of you can claim a day or arrange cover in the app.`,
  },
  [DAY_AT_RISK_ESCALATED_EVENT]: {
    title: (count) => `${count} pickups aren't settled`,
    body: (count, days) =>
      `${count} childcare days${onDays(days)} have no one confirmed for pickup yet. Open the app to accept the request or claim the day.`,
  },
  [CHILDCARE_PATTERN_CHANGED_EVENT]: {
    title: (count) => `The childcare pattern changed ${count} times`,
    body: (count) =>
      `The other parent made ${count} changes to which weekdays are childcare days. Check the calendar for how they affect upcoming pickups.`,
  },
  [CLOSURE_ADDED_EVENT]: {
    title: (count) => `${count} closures added`,
    body: (count, days) =>
      `${count} days${onDays(days)} are now marked closed — there's no childcare pickup on them.`,
  },
};

/**
 * For an event with no entry above. Unreachable while `catalogue.test.ts`
 * holds, but a bundle that silently lost its days would be worse than plain
 * copy, so the fallback still carries the count and the list.
 */
const FALLBACK_COPY: BundleCopy = {
  title: (count) => `${count} updates`,
  body: (count, days) => `${count} updates${onDays(days)}. Open the app for the details.`,
};

/** `subjectLabel`s of a group, in order, deduplicated — a day never listed twice. */
function subjectsOf(group: readonly Notification[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const notification of group) {
    const label = notification.subjectLabel;
    if (label && !seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  return labels;
}

/** Collapse two or more notifications of the same `(recipient, event)` into one. */
function bundle(group: readonly Notification[]): Notification {
  const [first] = group;
  const copy = BUNDLE_COPY[first.event] ?? FALLBACK_COPY;
  const days = listSubjects(subjectsOf(group));

  return {
    recipientId: first.recipientId,
    event: first.event,
    title: copy.title(group.length),
    body: copy.body(group.length, days),
  };
}

/**
 * Group one action's notifications by `(recipientId, event)` and collapse each
 * group of two or more into a single count-aware notification; a group of one
 * is returned exactly as it came in.
 *
 * Groups keep the order of their first member, so a bundled batch reads in the
 * order the domain service produced it.
 */
export function bundleNotifications(
  notifications: readonly Notification[],
): readonly Notification[] {
  // ` ` can't appear in a uuid or an event key, so it's a safe joiner —
  // no recipient/event pair can collide with another by string concatenation.
  const groups = new Map<string, Notification[]>();
  for (const notification of notifications) {
    const key = `${notification.recipientId} ${notification.event}`;
    const existing = groups.get(key);
    if (existing) existing.push(notification);
    else groups.set(key, [notification]);
  }

  return [...groups.values()].map((group) => (group.length === 1 ? group[0] : bundle(group)));
}
