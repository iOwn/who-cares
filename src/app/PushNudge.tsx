"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Callout } from "@/ui";
import styles from "./InstallPrompt.module.css";
import { shouldShowPushNudge } from "./pushNudgeEligibility";

/**
 * "Turn on notifications to get a badge on the icon" (issue #174, ADR-0022).
 *
 * The decision is the pure `shouldShowPushNudge()` (unit-tested); this owns the
 * browser state it needs — `display-mode`, `Notification.permission`, and a
 * per-browser dismissal in `localStorage` — and sends the parent to the
 * `/settings` push card, the one place permission is requested. Renders nothing
 * until mounted so the server HTML and first paint match, and no wrapper when
 * hidden. `className` lands on the `Callout`, like `InstallPrompt`.
 */

const DISMISSED_KEY = "whocares.push-nudge-dismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function PushNudge({ className }: { className?: string }) {
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(
      shouldShowPushNudge({
        standalone:
          typeof window.matchMedia === "function" &&
          window.matchMedia("(display-mode: standalone)").matches,
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
        permission: "Notification" in window ? Notification.permission : null,
        dismissed: readDismissed(),
      }),
    );
  }, []);

  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // A blocked-storage browser just re-shows it next visit.
    }
  };

  return (
    <Callout
      className={className}
      tone="neutral"
      icon={Bell}
      title="Get a badge on the app icon"
      action={
        <div className={styles.actions}>
          <Button size="sm" onPress={() => router.push("/settings")}>
            Turn on notifications
          </Button>
          <Button size="sm" variant="ghost" onPress={dismiss}>
            Not now
          </Button>
        </div>
      }
    >
      Allow notifications and the icon shows how many pickups need you, even when the app is closed.
    </Callout>
  );
}
