"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  HIDE_WEEKENDS_COOKIE,
  HIDE_WEEKENDS_COOKIE_MAX_AGE,
  serializeHideWeekends,
} from "./calendarPreferences";

/**
 * Write the viewer's "hide weekend days" preference (#130).
 *
 * A Server Action rather than `document.cookie` for two reasons: a cookie can
 * only be set from an action or a route handler in the App Router
 * (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`),
 * and an action's response invalidates the client Router Cache, so the already
 * prefetched `/` payload can't hand back a seven-column grid after the
 * preference changed. The explicit `revalidatePath` calls cover the server
 * side of the same thing.
 *
 * No session check: this sets nothing but the viewer's own layout, reads
 * nothing, and the cookie is theirs to forge anyway — which is why
 * `parseHideWeekends` treats it as untrusted display input. `httpOnly` all the
 * same, because nothing client-side has any reason to read it.
 */
export async function setHideWeekendsAction(hideWeekends: boolean): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(HIDE_WEEKENDS_COOKIE, serializeHideWeekends(hideWeekends), {
    maxAge: HIDE_WEEKENDS_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
  });
  revalidatePath("/");
  revalidatePath("/settings");
}
