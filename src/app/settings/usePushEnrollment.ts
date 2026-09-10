"use client";

import { useCallback, useEffect, useState } from "react";
import { urlBase64ToUint8Array } from "./pushSupport";

/**
 * The client half of web-push enrollment (issue #90): permission prompt →
 * `pushManager.subscribe` → `POST /api/push/subscribe`, and the reverse on
 * disable. `ServiceWorkerRegistrar` (root layout) has already registered
 * `/sw.js`; this hook waits on `navigator.serviceWorker.ready`.
 *
 * Every failure path resolves to a state, never an uncaught throw — push is
 * best-effort and email is the guaranteed channel (SPEC.md), so the card stays
 * calm and the rest of settings keeps working.
 */
export type PushState =
  | "loading"
  | "unsupported"
  | "unconfigured"
  | "denied"
  | "disabled"
  | "enabling"
  | "enabled"
  | "disabling"
  | "error";

export interface PushEnrollment {
  readonly state: PushState;
  /** Endpoint of *this* browser's active subscription, for the "this device" marker. */
  readonly currentEndpoint: string | null;
  readonly enable: () => Promise<void>;
  readonly disable: () => Promise<void>;
}

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function usePushEnrollment(onChange?: () => void): PushEnrollment {
  const [state, setState] = useState<PushState>("loading");
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolve(): Promise<PushState> {
      if (!isSupported()) return "unsupported";
      if (!VAPID_KEY) return "unconfigured";
      if (Notification.permission === "denied") return "denied";
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setCurrentEndpoint(existing?.endpoint ?? null);
        return existing ? "enabled" : "disabled";
      } catch {
        return "disabled";
      }
    }

    resolve().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    if (!isSupported() || !VAPID_KEY) return;
    setState("enabling");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "disabled");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
      });

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (!response.ok) {
        // Roll the browser-side subscription back so state stays consistent.
        await subscription.unsubscribe().catch(() => {});
        setState("error");
        return;
      }

      setCurrentEndpoint(subscription.endpoint);
      setState("enabled");
      onChange?.();
    } catch {
      setState("error");
    }
  }, [onChange]);

  const disable = useCallback(async () => {
    if (!isSupported()) return;
    setState("disabling");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        }).catch(() => {});
        await subscription.unsubscribe().catch(() => {});
      }
      setCurrentEndpoint(null);
      setState("disabled");
      onChange?.();
    } catch {
      setState("error");
    }
  }, [onChange]);

  return { state, currentEndpoint, enable, disable };
}
