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
  GERMAN_STATES,
  type GermanState,
  isGermanState,
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
  publicHolidaysChangedNotification,
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

// The childcare sections live on `/settings/household` (issue #143); the
// `"layout"` type covers every route under the settings segment.
function revalidateAll() {
  revalidatePath("/settings", "layout");
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

export type SetBundeslandResult = { ok: true } | { ok: false; error: string };

/**
 * Set or clear the household's Bundesland (issue #167, ADR-0020) — the
 * setting its public holidays are derived from. Reuses catalogue event 11
 * `childcare-pattern-changed`: changing it changes which days are childcare
 * days, same recipient and same "the other parent is notified" promise as
 * `savePatternAction`, so a 13th event would add nothing. A no-op (the same
 * value re-selected) notifies nothing, the same guard `savePatternAction`
 * applies via `patternVersionChangesSchedule`.
 */
export async function setBundeslandAction(state: GermanState | null): Promise<SetBundeslandResult> {
  if (state !== null && !isGermanState(state)) {
    return { ok: false, error: "That's not a recognised German state." };
  }

  const ctx = await context();
  const { householdId, repos } = ctx;
  const household = await repos.households.findById(householdId);
  if (!household) {
    return { ok: false, error: "Something went wrong saving that. Please try again." };
  }

  const isRealChange = (household.bundesland ?? null) !== state;
  if (!isRealChange) return { ok: true };

  await repos.households.save({ ...household, bundesland: state ?? undefined });

  const stateName = state ? (GERMAN_STATES.find((s) => s.code === state)?.name ?? state) : null;
  await notifyOtherMember(ctx, [state ?? "none"], (recipientId, actorName) => ({
    recipientId,
    event: CHILDCARE_PATTERN_CHANGED_EVENT,
    ...publicHolidaysChangedNotification(actorName, stateName),
  }));
  revalidateAll();
  return { ok: true };
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

/** One closure range as the settings form submits it (issue #131, #166). */
export interface ClosureEntry {
  date: CalendarDate;
  /**
   * Last date of an inclusive range (issue #131). One `Closure` row is still
   * written **per date** — CONTEXT.md keeps a closure a single day. Omitted,
   * it is just `date`.
   */
  endDate?: CalendarDate;
  reason?: string;
  /** The day stays a childcare day (issue #166, ADR-0021). Omitted ⇒ `false`. */
  needsCover?: boolean;
}

/**
 * Write closure entries as **one** action: one transaction (every row commits
 * or none), one `dispatchAll` call so the other parent gets one bundled
 * notification (ADR-0018). `editId` pins the single row being edited — an edit
 * ignores any range and never notifies (event 12 is add-only).
 */
async function writeClosureEntries(
  ctx: Awaited<ReturnType<typeof context>>,
  entries: readonly ClosureEntry[],
  editId?: string,
): Promise<SaveClosureResult> {
  const { householdId } = ctx;
  // With several rows, name the offending one so a parent can find it.
  const where = (index: number) => (entries.length > 1 ? `Row ${index + 1}: ` : "");

  const planned: { date: CalendarDate; reason?: string; needsCover: boolean }[] = [];
  for (const [index, entry] of entries.entries()) {
    // Editing is always the one row being edited; a range only applies to adds.
    const endDate = editId ? entry.date : (entry.endDate ?? entry.date);
    if (!entry.date || !endDate)
      return { ok: false, error: `${where(index)}Pick the closure dates.` };
    if (endDate < entry.date) {
      return {
        ok: false,
        error: `${where(index)}The last closure date can't be before the first.`,
      };
    }
    const dates = eachDateInclusive(entry.date, endDate);
    if (dates.length > MAX_CLOSURE_RANGE_DAYS) {
      return {
        ok: false,
        error: `${where(index)}That's more than ${MAX_CLOSURE_RANGE_DAYS} days of closures in one go — add them in shorter stretches.`,
      };
    }
    const reason = entry.reason?.trim() ? entry.reason.trim() : undefined;
    for (const date of dates) {
      planned.push({ date, ...(reason ? { reason } : {}), needsCover: entry.needsCover === true });
    }
  }

  // The whole batch commits together, the same way `savePatternAction` wraps its
  // own multi-statement write: a failure part-way through would otherwise leave
  // some days closed *and* — since the notification is built from what was
  // added — tell the other parent about none of it.
  let added: Map<CalendarDate, boolean>;
  try {
    added = await db.transaction(async (tx) => {
      const closures = createRepositories(tx).closures;
      const addedDates = new Map<CalendarDate, boolean>();
      for (const { date, reason, needsCover } of planned) {
        // One closure per date: reuse the row already on that date if there is
        // one — including one an earlier row of this same batch just wrote, so
        // overlapping rows resolve to one row per date, the later row winning.
        const onDate = await closures.findByDate(householdId, date);
        const isNewClosure = !editId && !onDate;
        const id = editId ?? onDate?.id ?? crypto.randomUUID();

        await closures.save({
          id,
          householdId,
          date,
          ...(reason ? { reason } : {}),
          ...(needsCover ? { needsCover: true } : {}),
        });
        // Catalogue event 12 fires on a closure being *added*, not on a later
        // edit to one that already exists.
        if (isNewClosure || addedDates.has(date)) addedDates.set(date, needsCover);
      }
      return addedDates;
    });
  } catch (thrown) {
    console.error("saveClosureAction failed", thrown);
    return { ok: false, error: "Something went wrong saving that. Please try again." };
  }

  // After commit, so a slow send can't hold the transaction open (ADR-0005).
  await notifyOtherMember(ctx, [...added.keys()], (recipientId, actorName, date) => ({
    recipientId,
    event: CLOSURE_ADDED_EVENT,
    subjectLabel: date,
    ...closureAddedNotification(actorName, date, added.get(date) === true),
  }));
  revalidateAll();
  return { ok: true, addedCount: added.size };
}

/** Add one closure range, or edit one existing closure when `id` is given. */
export async function saveClosureAction(
  input: ClosureEntry & {
    /** Present when editing an existing closure. */
    id?: string;
  },
): Promise<SaveClosureResult> {
  const ctx = await context();
  // A client-supplied `id` is only honoured if it's this household's row —
  // otherwise `save`'s upsert could re-parent someone else's closure (latent
  // until multi-household, but cheap to close now).
  const editId =
    input.id && (await closureBelongsToHousehold(ctx.repos, ctx.householdId, input.id))
      ? input.id
      : undefined;
  const { id: _id, ...entry } = input;
  return writeClosureEntries(ctx, [entry], editId);
}

/**
 * Add several closure ranges in one go (issue #166) — a whole year of
 * training days and the summer break from one form submit. All-or-nothing, one
 * bundled notification; a rejected row is named in the error.
 */
export async function saveClosuresAction(input: {
  entries: readonly ClosureEntry[];
}): Promise<SaveClosureResult> {
  if (input.entries.length === 0) return { ok: false, error: "Add at least one closure." };
  return writeClosureEntries(await context(), input.entries);
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

/**
 * Replace a whole range the Settings list presents as one row (issue #171,
 * `groupClosureRanges`). `ids` are the stored rows of that group: dates inside
 * the new `date`–`endDate` are upserted with the new kind/reason, group dates
 * outside it are deleted. Only the days *newly* closed count towards the
 * typo-guard cap and notify the other parent (event 12) — shortening and
 * kind/reason edits stay silent, as a single-row edit does. One transaction.
 */
export async function replaceClosureRangeAction(input: {
  ids: readonly string[];
  date: CalendarDate;
  endDate: CalendarDate;
  reason?: string;
  needsCover?: boolean;
}): Promise<SaveClosureResult> {
  const ctx = await context();
  const { householdId, repos } = ctx;
  const owned = await repos.closures.listByHousehold(householdId);
  const ownedById = new Map(owned.map((closure) => [closure.id, closure]));
  // Every id must be this household's — refuse the whole edit otherwise.
  if (input.ids.length === 0 || input.ids.some((id) => !ownedById.has(id))) {
    return { ok: false, error: "That closure no longer exists." };
  }
  if (!input.date || !input.endDate) return { ok: false, error: "Pick the closure dates." };
  if (input.endDate < input.date) {
    return { ok: false, error: "The last closure date can't be before the first." };
  }

  const idByDate = new Map(owned.map((closure) => [closure.date, closure.id]));
  // A bridged group (Fri to Mon) has no stored weekend inside it, and a re-save
  // must not invent one: inside the group's original span only days that are
  // already stored are written; dates outside it are new, as in the add form.
  const groupDates = input.ids.map((id) => ownedById.get(id)?.date ?? "").sort();
  const [oldStart, oldEnd] = [groupDates[0], groupDates[groupDates.length - 1]];
  const dates = eachDateInclusive(input.date, input.endDate).filter(
    (date) => idByDate.has(date) || date < oldStart || date > oldEnd,
  );
  const newDates = dates.filter((date) => !idByDate.has(date));
  if (newDates.length > MAX_CLOSURE_RANGE_DAYS) {
    return {
      ok: false,
      error: `That's more than ${MAX_CLOSURE_RANGE_DAYS} new days of closures in one go — add them in shorter stretches.`,
    };
  }
  const reason = input.reason?.trim() ? input.reason.trim() : undefined;
  const needsCover = input.needsCover === true;
  const keep = new Set(dates);
  const dropIds = input.ids.filter((id) => !keep.has(ownedById.get(id)?.date ?? ""));

  try {
    await db.transaction(async (tx) => {
      const closures = createRepositories(tx).closures;
      for (const id of dropIds) await closures.delete(id);
      for (const date of dates) {
        await closures.save({
          id: idByDate.get(date) ?? crypto.randomUUID(),
          householdId,
          date,
          ...(reason ? { reason } : {}),
          ...(needsCover ? { needsCover: true } : {}),
        });
      }
    });
  } catch (thrown) {
    console.error("replaceClosureRangeAction failed", thrown);
    return { ok: false, error: "Something went wrong saving that. Please try again." };
  }

  await notifyOtherMember(ctx, newDates, (recipientId, actorName, date) => ({
    recipientId,
    event: CLOSURE_ADDED_EVENT,
    subjectLabel: date,
    ...closureAddedNotification(actorName, date, needsCover),
  }));
  revalidateAll();
  return { ok: true, addedCount: newDates.length };
}

/** Remove every stored row of a range in one transaction (issue #171). */
export async function removeClosuresAction(ids: readonly string[]): Promise<void> {
  const { householdId, repos } = await context();
  const owned = new Set((await repos.closures.listByHousehold(householdId)).map((c) => c.id));
  // One foreign id voids the whole call — never a partial delete.
  if (ids.length === 0 || ids.some((id) => !owned.has(id))) return;
  await db.transaction(async (tx) => {
    const closures = createRepositories(tx).closures;
    for (const id of ids) await closures.delete(id);
  });
  revalidateAll();
}
