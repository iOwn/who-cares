"use client";

import { useState } from "react";
import { authClient } from "@/auth/client";
import { Button, Callout, Surface, TextField } from "@/ui";
import styles from "./SignInScreen.module.css";

/**
 * The unauthenticated landing screen (issue #47): an email field that
 * requests a magic link. Deliberately no signup form and no error detail on
 * a non-allowlisted email (SPEC.md "Identity") — the confirmation copy is the
 * same either way, since `auth.config.ts`'s `sendMagicLink` silently drops
 * mail to an unlisted address rather than surfacing an error.
 */
export function SignInScreen() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: "/" });
    setStatus(error ? "error" : "sent");
  }

  return (
    <main className={styles.base}>
      <Surface className={styles.card}>
        <p className={styles.wordmark}>WhoCares</p>
        <p className={styles.tagline}>Sign in to see who&rsquo;s on pickup.</p>

        {status === "sent" ? (
          <Callout tone="info" title="Check your email" role="status">
            If {email} is a WhoCares account, we sent it a sign-in link.
          </Callout>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <TextField
              label="Email"
              name="email"
              autoComplete="email"
              isRequired
              value={email}
              onChange={setEmail}
              isDisabled={status === "sending"}
            />
            {status === "error" && (
              <Callout tone="danger" role="alert">
                Something went wrong sending the link. Try again.
              </Callout>
            )}
            <Button
              type="submit"
              fullWidth
              isDisabled={status === "sending" || email.trim() === ""}
            >
              {status === "sending" ? "Sending…" : "Send sign-in link"}
            </Button>
          </form>
        )}
      </Surface>
    </main>
  );
}
