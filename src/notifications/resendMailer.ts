/**
 * The Resend-backed `Mailer` (SPEC.md "Email", ADR-0004). Plain-text only — the
 * copy is already calm and factual, and a text body renders everywhere with no
 * template to maintain.
 *
 * `createResendMailer` returns `null` when `RESEND_API_KEY` / `EMAIL_FROM` are
 * absent; `./services.ts` falls back to the no-op mailer so local dev, CI, and
 * `next build` need no real credentials (issue #55).
 */

import { Resend } from "resend";
import type { EmailMessage, Mailer } from "@/domain";

export interface ResendMailerConfig {
  readonly apiKey: string;
  /** The `From:` address, e.g. `WhoCares <notify@whocares.app>`. */
  readonly from: string;
}

export function createResendMailer(config: ResendMailerConfig | null): Mailer | null {
  if (!config) return null;
  const resend = new Resend(config.apiKey);

  return {
    async send(message: EmailMessage): Promise<void> {
      const { error } = await resend.emails.send({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.body,
      });
      if (error) {
        // Surface as a thrown error so the caller's try/catch logs it; a failed
        // email is worth knowing about (it's the guaranteed channel).
        throw new Error(`Resend send failed: ${error.name} — ${error.message}`);
      }
    },
  };
}
