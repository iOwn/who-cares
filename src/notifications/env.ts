/**
 * Env reading for notification delivery (issue #55).
 *
 * Unlike `src/auth/env.ts`, a missing var here is **not** fatal: the adapters
 * fall back to no-ops (`./services.ts`), so local dev and CI need no real
 * Gmail / VAPID credentials. A production deploy that wants real delivery sets
 * all of these — see `docs/notifications.md` and `scripts/setup-notifications.sh`.
 */

import type { GmailMailerConfig } from "./gmailMailer";
import type { VapidConfig } from "./webPushSender";

/** Gmail SMTP config, or `null` when `GMAIL_USER` / `GMAIL_APP_PASSWORD` are unset. */
export function getGmailConfig(): GmailMailerConfig | null {
  const user = process.env.GMAIL_USER?.trim();
  const appPassword = process.env.GMAIL_APP_PASSWORD?.trim();
  if (!user || !appPassword) return null;
  return { user, appPassword };
}

/** VAPID config, or `null` when any of the three keys is unset. */
export function getVapidConfig(): VapidConfig | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/**
 * The shared secret the Vercel Cron request carries in `Authorization: Bearer
 * <CRON_SECRET>` (Vercel sets this header automatically from the `CRON_SECRET`
 * env var). Missing ⇒ the cron route refuses every request.
 */
export function getCronSecret(): string | null {
  return process.env.CRON_SECRET?.trim() || null;
}
