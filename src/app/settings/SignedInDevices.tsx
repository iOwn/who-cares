"use client";

import { Laptop } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/auth/client";
import { announce, Button, Callout, Dialog, EmptyState, Surface } from "@/ui";
import { describeUserAgent, formatLastActive } from "./deviceInfo";
import styles from "./SettingsScreen.module.css";

export interface DeviceView {
  /** The session token — the id `revokeSession` takes. */
  readonly token: string;
  readonly userAgent: string | null;
  /** ISO timestamp of the session's last update / creation. */
  readonly lastActiveAt: string;
  readonly isCurrent: boolean;
}

interface Props {
  readonly devices: readonly DeviceView[];
}

/**
 * "Signed-in devices" (issue #48) — one row per active Better Auth session,
 * each revocable. Revoke goes through a `Dialog` confirm (never
 * `window.confirm`, which freezes the page — docs brief). Because sessions are
 * DB-backed, `revokeSession` invalidates the session server-side immediately;
 * revoking the current device signs this browser out and returns to sign-in.
 */
export function SignedInDevices({ devices }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<DeviceView | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function confirmRevoke() {
    if (!pending || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      if (pending.isCurrent) {
        await authClient.signOut();
        router.replace("/");
        return;
      }
      const { error } = await authClient.revokeSession({ token: pending.token });
      if (error) {
        setFailed(true);
        return;
      }
      setPending(null);
      announce("That device has been signed out.");
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (devices.length === 0) {
    return (
      <EmptyState
        icon={Laptop}
        title="No active sessions"
        description="Sign in again to see this device listed."
      />
    );
  }

  return (
    <>
      <ul className={styles.deviceList}>
        {devices.map((device) => (
          <li key={device.token}>
            <Surface className={styles.deviceRow}>
              <span className={styles.deviceIcon} aria-hidden>
                <Laptop size={18} aria-hidden />
              </span>
              <div className={styles.deviceText}>
                <p className={styles.deviceName}>
                  {describeUserAgent(device.userAgent)}
                  {device.isCurrent && <span className={styles.thisDevice}> · This device</span>}
                </p>
                <p className={styles.deviceMeta}>
                  Last active {formatLastActive(new Date(device.lastActiveAt))}
                </p>
              </div>
              <Button
                variant="ghost"
                tone="danger"
                size="sm"
                onPress={() => {
                  setFailed(false);
                  setPending(device);
                }}
              >
                {device.isCurrent ? "Sign out" : "Revoke"}
              </Button>
            </Surface>
          </li>
        ))}
      </ul>

      <Dialog
        presentation="center"
        isOpen={pending != null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setPending(null);
            setFailed(false);
          }
        }}
      >
        {({ close }) => (
          <div className={styles.dialogBody}>
            <Dialog.Header
              title={pending?.isCurrent ? "Sign out this device?" : "Revoke this device?"}
            />
            <p className={styles.dialogText}>
              {pending?.isCurrent
                ? "You’ll be signed out here and sent back to the sign-in screen. Your other devices stay signed in."
                : `${describeUserAgent(pending?.userAgent)} will be signed out right away and will need a new magic link or passkey to get back in.`}
            </p>
            {failed && (
              <Callout tone="danger" role="alert">
                That didn’t work. Check your connection and try again.
              </Callout>
            )}
            <div className={styles.dialogActions}>
              <Button variant="ghost" onPress={close} isDisabled={busy}>
                Cancel
              </Button>
              <Button variant="destructive" onPress={confirmRevoke} isDisabled={busy}>
                {busy ? "Working…" : pending?.isCurrent ? "Sign out" : "Revoke"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
