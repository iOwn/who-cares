"use client";

import { Check, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { authClient } from "@/auth/client";
import { announce, Button, Callout, Surface } from "@/ui";
import { describeUserAgent } from "./deviceInfo";
import styles from "./SettingsScreen.module.css";

type State =
  | { kind: "checking" }
  | { kind: "unsupported" }
  | { kind: "idle" }
  | { kind: "enrolling" }
  | { kind: "enrolled" }
  | { kind: "already" }
  | { kind: "cancelled" }
  | { kind: "error" };

/**
 * "Sign in faster on this device" — progressive passkey enrollment from the
 * current signed-in session (issue #48). Success shows a *persistent* inline
 * confirmation row (there is no Toast — docs/design-system-inventory.md
 * "Confirmed exclusions") plus an `announce()` for screen readers.
 *
 * Every failure path is handled without an uncaught throw: no WebAuthn support,
 * an authenticator that already holds a passkey for this account, a cancelled
 * OS prompt, or anything else — magic link always remains available, so the
 * copy stays calm and never blocks.
 */
export function PasskeyCard() {
  const [state, setState] = useState<State>({ kind: "checking" });

  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      typeof window.PublicKeyCredential === "function" &&
      typeof navigator?.credentials?.create === "function";
    setState({ kind: supported ? "idle" : "unsupported" });
  }, []);

  async function enroll() {
    setState({ kind: "enrolling" });
    try {
      const { error } = await authClient.passkey.addPasskey({
        name: describeUserAgent(navigator.userAgent),
      });

      if (!error) {
        setState({ kind: "enrolled" });
        announce("This device is set up. Next time you can sign in with a passkey.");
        return;
      }

      const code = "code" in error ? error.code : undefined;
      if (code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
        setState({ kind: "already" });
        announce("This device already has a passkey.");
        return;
      }
      if (code === "ERROR_CEREMONY_ABORTED") {
        setState({ kind: "cancelled" });
        return;
      }
      setState({ kind: "error" });
    } catch {
      setState({ kind: "error" });
    }
  }

  if (state.kind === "checking") return null;

  if (state.kind === "unsupported") {
    return (
      <Callout tone="neutral" icon={KeyRound}>
        This browser can’t store a passkey. You’ll keep signing in with a magic link — that always
        works.
      </Callout>
    );
  }

  if (state.kind === "enrolled" || state.kind === "already") {
    return (
      <Surface className={styles.confirmRow}>
        <span className={styles.confirmIcon} aria-hidden>
          <Check size={18} aria-hidden />
        </span>
        <p className={styles.confirmText}>
          {state.kind === "enrolled"
            ? "This device is set up. Next time, sign in with a passkey instead of waiting for an email."
            : "This device already has a passkey."}
        </p>
      </Surface>
    );
  }

  return (
    <Surface className={styles.card}>
      <div className={styles.cardText}>
        <p className={styles.cardTitle}>Use a passkey on this device</p>
        <p className={styles.cardBody}>
          Sign in with your fingerprint, face, or screen lock instead of waiting for a magic-link
          email. Magic link still works as a backup and for new devices.
        </p>
      </div>

      {state.kind === "cancelled" && (
        <Callout tone="neutral" role="status">
          Setup was cancelled. You can try again whenever you like.
        </Callout>
      )}
      {state.kind === "error" && (
        <Callout tone="danger" role="alert">
          Something went wrong setting up a passkey. You can still sign in with a magic link.
        </Callout>
      )}

      <Button variant="secondary" onPress={enroll} isDisabled={state.kind === "enrolling"}>
        {state.kind === "enrolling" ? "Setting up…" : "Set up passkey"}
      </Button>
    </Surface>
  );
}
