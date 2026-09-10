"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/auth/client";
import { Button, Callout, Surface, TextField } from "@/ui";
import { InstallPrompt } from "./InstallPrompt";
import styles from "./SignInScreen.module.css";

/**
 * The unauthenticated landing screen (issue #47): an email field that
 * requests a magic link. Deliberately no signup form and no error detail on
 * a non-allowlisted email (SPEC.md "Identity") — the confirmation copy is the
 * same either way, since `auth.config.ts`'s `sendMagicLink` silently drops
 * mail to an unlisted address rather than surfacing an error.
 *
 * A passkey shortcut (issue #48) appears whenever the browser supports
 * WebAuthn; pressing it triggers the platform's credential picker, which is a
 * no-op the user can dismiss if this device has no passkey for the app. Magic
 * link stays the primary, always-present path.
 */
export function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [passkey, setPasskey] = useState<"hidden" | "ready" | "authenticating" | "error">("hidden");

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      typeof window.PublicKeyCredential === "function" &&
      typeof navigator?.credentials?.get === "function"
    ) {
      setPasskey("ready");
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: "/" });
    setStatus(error ? "error" : "sent");
  }

  async function handlePasskey() {
    setPasskey("authenticating");
    try {
      const { error } = await authClient.signIn.passkey();
      if (error) {
        const code = "code" in error ? error.code : undefined;
        // A cancelled OS prompt is not a failure — just let them try again.
        setPasskey(
          code === "ERROR_CEREMONY_ABORTED" || code === "AUTH_CANCELLED" ? "ready" : "error",
        );
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setPasskey("error");
    }
  }

  return (
    <main className={styles.base}>
      <div className={styles.stack}>
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

              {passkey !== "hidden" && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth
                    onPress={handlePasskey}
                    isDisabled={passkey === "authenticating"}
                  >
                    {passkey === "authenticating"
                      ? "Waiting for passkey…"
                      : "Sign in with a passkey"}
                  </Button>
                  {passkey === "error" && (
                    <Callout tone="danger" role="alert">
                      Couldn’t sign in with a passkey. Use the email link instead.
                    </Callout>
                  )}
                </>
              )}
            </form>
          )}
        </Surface>
        <InstallPrompt />
      </div>
    </main>
  );
}
