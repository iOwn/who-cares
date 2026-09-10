"use client";

import { Share } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Callout } from "@/ui";
import styles from "./InstallPrompt.module.css";
import { installPromptState } from "./installEligibility";

/**
 * The onboarding "Add WhoCares to your Home Screen" nudge (issue #56, PWA
 * polish).
 *
 * The manifest (`src/app/manifest.ts`), the icons, and the service worker
 * (`public/sw.js` + `ServiceWorkerRegistrar`) are already shipped — this is the
 * missing human-facing half: surface the install affordance during onboarding
 * so the app actually lands on a Home Screen (on iOS 16.4+ that is also the only
 * route to web push).
 *
 * All eligibility logic is the pure `installPromptState()` (unit-tested); this
 * component only owns the browser state it needs: the deferred
 * `beforeinstallprompt` event, the `display-mode: standalone` check, and a
 * per-browser dismissal in `localStorage`. Renders nothing until mounted so the
 * server HTML and first client paint match — and nothing (no wrapper) when there
 * is nothing to show, so a host can place it inline without reserving space.
 * `className` lands on the rendered `Callout` for host-controlled spacing.
 */

const DISMISSED_KEY = "whocares.install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function InstallPrompt({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDismissed(readDismissed());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!mounted) return null;

  const standalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;

  const state = installPromptState({
    standalone,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    canPrompt: deferred != null,
    dismissed,
  });

  if (state === "hidden") return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // A private-mode / blocked-storage browser just re-shows it next visit.
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
  };

  if (state === "prompt") {
    return (
      <Callout
        className={className}
        tone="info"
        dot
        title="Add WhoCares to your Home Screen"
        action={
          <div className={styles.actions}>
            <Button size="sm" onPress={install}>
              Add to Home Screen
            </Button>
            <Button size="sm" variant="ghost" onPress={dismiss}>
              Not now
            </Button>
          </div>
        }
      >
        Open it like an app, get pickup changes as notifications, and skip the browser tabs.
      </Callout>
    );
  }

  return (
    <Callout
      className={className}
      tone="neutral"
      icon={Share}
      title="Add WhoCares to your Home Screen"
      action={
        <Button size="sm" variant="ghost" onPress={dismiss}>
          Got it
        </Button>
      }
    >
      On iPhone and iPad: tap the Share button, then “Add to Home Screen”. Open WhoCares from there
      to get pickup notifications.
    </Callout>
  );
}
