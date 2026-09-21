"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/auth/client";
import { Button, Callout, Surface, TextField } from "@/ui";
import { InstallPrompt } from "./InstallPrompt";
import styles from "./SignInScreen.module.css";

/**
 * The unauthenticated landing screen (issue #47): an email field that
 * requests the sign-in email. Deliberately no signup form and no error detail
 * on a non-allowlisted email (SPEC.md "Identity") — the confirmation copy is
 * the same either way, since `auth.config.ts`'s `sendMagicLink` silently
 * drops mail to an unlisted address rather than surfacing an error.
 *
 * The email carries a magic link *and* a 6-digit code (issue #157,
 * ADR-0019). Once it is sent, this screen turns into a code form: an
 * installed Home Screen app is its own browsing context, so a link tapped in
 * Mail signs in Safari, never the app — the code is the only way in that
 * completes *here*. In a normal tab the link still works; the code field is
 * simply also there (a desktop user reading mail on their phone types it).
 *
 * A passkey shortcut (issue #48) appears whenever the browser supports
 * WebAuthn; pressing it triggers the platform's credential picker, which is a
 * no-op the user can dismiss if this device has no passkey for the app. The
 * email stays the primary, always-present path.
 */

type Status = "idle" | "sending" | "sent" | "verifying" | "error";
type CodeError = "none" | "wrong" | "stale";

const CODE_LENGTH = 6;

/**
 * A wrong code can be retried (the plugin allows three attempts); anything
 * else — expired, attempts exhausted, network — needs a fresh email.
 */
function codeErrorFor(code: string | undefined): CodeError {
  return code === "INVALID_OTP" ? "wrong" : "stale";
}

export function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [codeError, setCodeError] = useState<CodeError>("none");
  const [standalone, setStandalone] = useState(false);
  const [passkey, setPasskey] = useState<"hidden" | "ready" | "authenticating" | "error">("hidden");

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      typeof window.PublicKeyCredential === "function" &&
      typeof navigator?.credentials?.get === "function"
    ) {
      setPasskey("ready");
    }
    // Read after mount, never during render — the server HTML has no idea
    // whether it is being shown inside an installed app. Same query
    // `InstallPrompt` uses to know the install succeeded.
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      setStandalone(window.matchMedia("(display-mode: standalone)").matches);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: "/" });
    setStatus(error ? "error" : "sent");
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("verifying");
    setCodeError("none");
    const { error } = await authClient.signIn.emailOtp({ email, otp: code });
    if (error) {
      setCodeError(codeErrorFor("code" in error ? error.code : undefined));
      setStatus("sent");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  function restart() {
    setCode("");
    setCodeError("none");
    setStatus("idle");
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

  const awaitingCode = status === "sent" || status === "verifying";

  return (
    <main className={styles.base}>
      <div className={styles.stack}>
        <Surface className={styles.card}>
          <p className={styles.wordmark}>WhoCares</p>
          <p className={styles.tagline}>Sign in to see who&rsquo;s on pickup.</p>

          {awaitingCode ? (
            <form onSubmit={handleCodeSubmit} className={styles.form}>
              <Callout tone="info" title="Check your email" role="status">
                {standalone
                  ? `If ${email} is a WhoCares account, we sent it a 6-digit code. Enter it here — the link in the email opens in your browser, not in this app.`
                  : `If ${email} is a WhoCares account, we sent it a sign-in link and a code.`}
              </Callout>
              <TextField
                label="Code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={CODE_LENGTH}
                isRequired
                autoFocus
                value={code}
                onChange={setCode}
                // Read-only rather than disabled while verifying: a disabled input drops
                // focus, and a wrong code should leave the parent right where they were.
                isReadOnly={status === "verifying"}
              />
              {codeError === "wrong" && (
                <Callout tone="danger" role="alert">
                  That code didn’t match. Check the email and try again.
                </Callout>
              )}
              {codeError === "stale" && (
                <Callout tone="danger" role="alert">
                  That code is no longer valid. Send a new one to try again.
                </Callout>
              )}
              <Button
                type="submit"
                fullWidth
                isDisabled={status === "verifying" || code.trim().length !== CODE_LENGTH}
              >
                {status === "verifying" ? "Signing in…" : "Sign in"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                fullWidth
                onPress={restart}
                isDisabled={status === "verifying"}
              >
                Send a new code
              </Button>
            </form>
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
                      Couldn’t sign in with a passkey. Use the sign-in email instead.
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
