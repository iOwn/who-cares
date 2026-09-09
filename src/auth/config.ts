/**
 * The Better Auth instance (issue #47): self-hosted, magic-link only, backed
 * by Neon via the Drizzle adapter. `src/app/api/auth/[...all]/route.ts` is
 * the only thing that mounts it.
 *
 * Unlike `src/db` / `src/domain`, this module is deliberately Next-coupled —
 * the `nextCookies()` plugin needs `next/headers` to set cookies from a
 * Server Action, which is inherent to Better Auth's Next integration, not a
 * choice this file makes. Per ADR-0005 this is adapter wiring, not domain
 * logic, and is exercised by the E2E smoke path (#56) rather than unit-tested.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { Resend } from "resend";
// Deep imports, not the `@/db` barrel: the barrel re-exports `./migrate`,
// whose `new URL("./migrations", import.meta.url)` Turbopack tries to
// resolve as a bundled asset the moment anything pulls the barrel into the
// Next app's module graph — this route never runs migrations, so it should
// never see that module at all.
import { schema } from "@/db/client";
import { createNeonDatabase } from "@/db/neon";
import { createRepositories } from "@/db/repositories";
import { bootstrapHousehold, isAllowlistedEmail, noopAdapters } from "@/domain";
import { getAllowlistedEmails, requireEnv } from "./env";

export const db = createNeonDatabase(requireEnv("DATABASE_URL"));

const resend = new Resend(requireEnv("RESEND_API_KEY"));

/** 45 days — the middle of the "30-60 day sliding lifetime" the spec asks for. */
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 45;
/** Better Auth refreshes `expiresAt` on use whenever it's within this of expiry — the "sliding" half. */
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

export const auth = betterAuth({
  baseURL: requireEnv("BETTER_AUTH_URL"),
  secret: requireEnv("BETTER_AUTH_SECRET"),
  database: drizzleAdapter(db, { provider: "pg", schema }),

  session: {
    expiresIn: SESSION_LIFETIME_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },

  advanced: {
    // `useSecureCookies: false` stops Better Auth prepending its own
    // `__Secure-` prefix (it always would in production otherwise), so the
    // `__Host-` name below is the literal cookie name — `__Host-` already
    // implies Secure, and we set `attributes.secure` explicitly since
    // disabling the auto-prefix also disables the attribute it would have
    // set. `__Host-` additionally requires `Path=/` and no `Domain`
    // attribute, both true here (no `crossSubDomainCookies`).
    useSecureCookies: false,
    cookies: {
      session_token: {
        name: "__Host-whocares.session",
        attributes: {
          secure: true,
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        },
      },
    },
  },

  user: {
    /**
     * The allowlist gate (SPEC.md "Identity"). Runs before `create-user` /
     * `link-account` / OAuth `sign-in`; a non-allowlisted email is refused.
     * Defense in depth — `sendMagicLink` below already never mails a
     * non-allowlisted address, so this can only fire for a hand-crafted
     * request.
     */
    async validateUserInfo({ user }) {
      if (!user.email || isAllowlistedEmail(user.email, getAllowlistedEmails())) return;
      return { error: "email_not_allowed", errorDescription: "This email is not registered." };
    },
  },

  databaseHooks: {
    user: {
      create: {
        /**
         * First allowlisted sign-in materialises the Household + both
         * Members + the Child (idempotent — the second allowlisted email
         * just attaches). `validateUserInfo` above already guarantees
         * `user.email` is allowlisted by the time this runs.
         */
        async after() {
          // A transaction, not `createRepositories(db)` directly: on a fresh
          // household this writes the household row before its members and
          // child exist, and "exactly two members / one child" is a deferred
          // constraint that only fires at COMMIT (`src/db/schema.ts`) — outside
          // a transaction the household insert would try to commit, and fail,
          // on its own.
          await db.transaction((tx) =>
            bootstrapHousehold(
              { ...createRepositories(tx), ids: noopAdapters.systemIdGenerator },
              getAllowlistedEmails(),
            ),
          );
        },
      },
    },
  },

  plugins: [
    magicLink({
      async sendMagicLink({ email, url }) {
        if (!isAllowlistedEmail(email, getAllowlistedEmails())) {
          // Silently drop rather than error: don't confirm-by-error which
          // emails are registered (SPEC.md "Identity" — no invite flow).
          return;
        }
        await resend.emails.send({
          from: requireEnv("EMAIL_FROM"),
          to: email,
          subject: "Sign in to WhoCares",
          text: `Tap to sign in to WhoCares:\n\n${url}\n\nThis link expires in 5 minutes.`,
        });
      },
    }),
    // Must be last — see Better Auth's Next.js integration docs.
    nextCookies(),
  ],
});
