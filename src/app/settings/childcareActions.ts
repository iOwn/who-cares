"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/auth";
import { db } from "@/auth/config";
// Deep import, not the `@/db` barrel — see the comment in `src/auth/config.ts`.
import { createRepositories } from "@/db/repositories";
import {
  type CalendarDate,
  CHILDCARE_PATTERN_CHANGED_EVENT,
  type ChildcarePatternVersion,
  CLOSURE_ADDED_EVENT,
  eachDateInclusive,
  MAX_CLOSURE_RANGE_DAYS,
  type Member,
  type Notification,
  patternVersionChangesSchedule,
  type Weekday,
} from "@/domain";
import {
  closureAddedNotification,
  notificationServicesFor,
  patternChangedNotification,
} from "@/notifications";

/**
 * Thin Server Actions for the childcare-settings feature (#49). Adapters over
 * the repositories + the effective-dated-pattern rule (ADR-0002) — no domain
 * logic of their own (ADR-0005). Kept in their own file so a merge with the
 * parallel #48 settings work stays mechanical.
 *
 * `childcareActions.test.ts` guards the cross-cutting contracts: a closure range
 * writes one row per date, in one transaction, but sends **one** notification
 * (issue #131, ADR-0018); event 12 fires on an add, never on an edit; and
 * user-facing validation comes back as a result rather than a throw. The domain
 * behaviour itself is tested in `childcareDay.ts`.
 */

async function context() {
  const session = await getCurrentSession();
  if (!session) throw new Error("Not signed in");
  const repos = createRepositories(db);
  return {
    householdId: session.household.id,
    actor: session.member,
    repos,
  };
}

function revalidateAll() {
  revalidatePath("/settings");
  revalidatePath("/");
}

/**
 * Send this action's settings-change notifications to the *other* member
 * (catalogue events 11 + 12), after the write. `build` is called once per
 * subject — one date for a single closure, several for a range — and the whole
 * batch goes through `dispatchAll`, which bundles it into one notification
 * (ADR-0018). A single-member household has no one to tell.
 */
async function notifyOtherMember(
  ctx: Awaited<ReturnType<typeof context>>,
  subjects: readonly string[],
  build: (recipientId: string, actorName: string, subject: string) => Notification,
): Promise<void> {
  if (subjects.length === 0) return;
  const members = await ctx.repos.members.listByHousehold(ctx.householdId);
  const other = members.find((m: Member) => m.id !== ctx.actor.id);
  if (!other) return;

  await notificationServicesFor(db).dispatchAll(
    subjects.map((subject) => build(other.id, ctx.actor.name, subject)),
  );
}

/** Insert (or replace, if one already starts on that date) a pattern version. */
function upsertVersion(
  versions: readonly ChildcarePatternVersion[],
  next: ChildcarePatternVersion,
): ChildcarePatternVersion[] {
  return [...versions.filter((v) => v.effectiveFrom !== next.effectiveFrom), next].sort((a, b) =>
    a.effectiveFrom < b.effectiveFrom ? -1 : 1,
  );
}

export async function savePatternAction(input: {
  weekdays: Weekday[];
  effectiveFrom: CalendarDate;
}): Promise<void> {
  const ctx = await context();
  const { householdId, repos } = ctx;
  const existing = await repos.childcarePattern.findByHousehold(householdId);
  // Compare against the version effective *for this date*, not just one starting
  // on the exact same date — a future-dated version that restates the current
  // weekdays changes no pickups and must not notify (issue #92).
  const isRealChange = patternVersionChangesSchedule(existing, input.weekdays, input.effectiveFrom);
  const versions = upsertVersion(existing?.versions ?? [], {
    weekdays: input.weekdays,
    effectiveFrom: input.effectiveFrom,
  });
  // `childcarePattern.save` is delete-then-insert; run it in one transaction so
  // a mid-write failure can't leave the household with no pattern at all
  // (`src/db/repositories/childcarePattern.ts`; same pattern as
  // `src/auth/config.ts`'s household bootstrap).
  await db.transaction((tx) =>
    createRepositories(tx).childcarePattern.save({ id: householdId, householdId, versions }),
  );

  if (isRealChange) {
    await notifyOtherMember(ctx, [input.effectiveFrom], (recipientId, actorName) => ({
      recipientId,
      event: CHILDCARE_PATTERN_CHANGED_EVENT,
      ...patternChangedNotification(actorName),
    }));
  }
  revalidateAll();
}

/** `true` iff `id` names a closure that belongs to `householdId`. */
async function closureBelongsToHousehold(
  repos: Awaited<ReturnType<typeof context>>["repos"],
  householdId: string,
  id: string,
): Promise<boolean> {
  const owned = await repos.closures.listByHousehold(householdId);
  return owned.some((closure) => closure.id === id);
}

/**
 * Discriminated result rather than a thrown error. A message thrown out of a
 * Server Action does **not** survive a production build — Next replaces it with
 * a generic string plus a digest to avoid leaking server detail
 * (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`),
 * so validation a real user can hit (an inverted range, a shutdown longer than
 * the cap) has to come back as a value. Same shape `requestActions.ts` uses.
 */
export type SaveClosureResult = { ok: true; addedCount: number } | { ok: false; error: string };

export async function saveClosureAction(input: {
  /** Present when editing an existing closure. */
  id?: string;
  date: CalendarDate;
  /**
   * Last date of an inclusive range (issue #131). One `Closure` row is still
   * written **per date** — CONTEXT.md keeps a closure a single day — but it is
   * one action, so the other parent gets one bundled notification instead of
   * one per day. Omitted, or when editing, it is just `date`.
   */
  endDate?: CalendarDate;
  reason?: string;
}): Promise<SaveClosureResult> {
  const ctx = await context();
  const { householdId, repos } = ctx;
  const reason = input.reason?.trim() ? input.reason.trim() : undefined;

  // A client-supplied `id` is only honoured if it's this household's row —
  // otherwise `save`'s upsert could re-parent someone else's closure (latent
  // until multi-household, but cheap to close now).
  const editId =
    input.id && (await closureBelongsToHousehold(repos, householdId, input.id))
      ? input.id
      : undefined;

  // Editing is always the one row being edited; a range only applies to adds.
  const endDate = editId ? input.date : (input.endDate ?? input.date);
  if (endDate < input.date) {
    return { ok: false, error: "The last closure date can't be before the first." };
  }
  const dates = eachDateInclusive(input.date, endDate);
  if (dates.length > MAX_CLOSURE_RANGE_DAYS) {
    return {
      ok: false,
      error: `That's more than ${MAX_CLOSURE_RANGE_DAYS} days of closures in one go — add them in shorter stretches.`,
    };
  }

  // The whole range commits together, the same way `savePatternAction` wraps its
  // own multi-statement write: a failure part-way through a 31-day stretch would
  // otherwise leave half the days closed *and* — since the notification is built
  // from what was added — tell the other parent about none of it.
  let added: CalendarDate[];
  try {
    added = await db.transaction(async (tx) => {
      const closures = createRepositories(tx).closures;
      // One closure per date: reuse the row already on that date if there is one.
      const addedDates: CalendarDate[] = [];
      for (const date of dates) {
        const onDate = await closures.findByDate(householdId, date);
        const isNewClosure = !editId && !onDate;
        const id = editId ?? onDate?.id ?? crypto.randomUUID();

        await closures.save({ id, householdId, date, ...(reason ? { reason } : {}) });
        // Catalogue event 12 fires on a closure being *added*, not on a later
        // edit to one that already exists — so a range spanning a day that is
        // already closed produces no notification for that day.
        if (isNewClosure) addedDates.push(date);
      }
      return addedDates;
    });
  } catch (thrown) {
    console.error("saveClosureAction failed", thrown);
    return { ok: false, error: "Something went wrong saving that. Please try again." };
  }

  // After commit, so a slow send can't hold the transaction open (ADR-0005).
  await notifyOtherMember(ctx, added, (recipientId, actorName, date) => ({
    recipientId,
    event: CLOSURE_ADDED_EVENT,
    subjectLabel: date,
    ...closureAddedNotification(actorName, date),
  }));
  revalidateAll();
  return { ok: true, addedCount: added.length };
}

export async function removeClosureAction(id: string): Promise<void> {
  const { householdId, repos } = await context();
  // `ClosureRepository.delete` takes a bare id; scope it to the household here
  // so a stray id can't drop another household's row (latent in single-
  // household v1 — see `saveClosureAction`).
  if (!(await closureBelongsToHousehold(repos, householdId, id))) return;
  await repos.closures.delete(id);
  revalidateAll();
}
