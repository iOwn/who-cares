/**
 * The Gmail SMTP-backed `Mailer` (SPEC.md "Email", ADR-0014). Plain-text
 * only — the copy is already calm and factual, and a text body renders
 * everywhere with no template to maintain.
 *
 * `createGmailMailer` returns `null` when `GMAIL_USER` / `GMAIL_APP_PASSWORD`
 * are absent; `./services.ts` falls back to the no-op mailer so local dev,
 * CI, and `next build` need no real credentials (issue #55, issue #112).
 * `src/auth/config.ts` (ADR-0015) is a second caller that never has a `null`
 * config to pass — the overload below gives it back a plain `Mailer`, no
 * caller-side null-narrowing required.
 */

import { createTransport } from "nodemailer";
import type { EmailMessage, Mailer } from "@/domain";

export interface GmailMailerConfig {
  /** The Gmail address to authenticate as and send from, e.g. `you@gmail.com`. */
  readonly user: string;
  /** A Gmail App Password (not the account password) — see docs/notifications.md. */
  readonly appPassword: string;
}

export function createGmailMailer(config: GmailMailerConfig): Mailer;
export function createGmailMailer(config: GmailMailerConfig | null): Mailer | null;
export function createGmailMailer(config: GmailMailerConfig | null): Mailer | null {
  if (!config) return null;
  const transport = createTransport({
    service: "gmail",
    auth: { user: config.user, pass: config.appPassword },
  });

  return {
    async send(message: EmailMessage): Promise<void> {
      try {
        await transport.sendMail({
          // A display name, not just the bare address — Gmail SMTP requires
          // the address half to match the authenticated account, but the
          // "WhoCares" name is still ours to set (the previous Resend
          // adapter's `EMAIL_FROM` gave the same "WhoCares <…>" shape).
          from: `WhoCares <${config.user}>`,
          to: message.to,
          subject: message.subject,
          text: message.body,
        });
      } catch (error) {
        // Surface as a thrown error so the caller's try/catch logs it; a
        // failed email is worth knowing about (it's the guaranteed channel).
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Gmail SMTP send failed: ${reason}`);
      }
    },
  };
}
