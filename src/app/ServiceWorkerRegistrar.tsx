"use client";

import { useEffect } from "react";

/**
 * Registers `/sw.js` once on app load (issue #90).
 *
 * Mounted in the root layout, not the settings page: the service worker has to
 * be active for a push to be delivered and shown even when the app isn't open,
 * so registration can't wait until someone visits `/settings`. Enrollment (the
 * `Notification` permission prompt + `pushManager.subscribe`) still happens only
 * from the settings card — this just makes sure the worker is there.
 *
 * Renders nothing. A registration failure is logged and ignored: push is
 * best-effort and email is the guaranteed channel (SPEC.md).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error) => {
        console.warn("service worker registration failed", error);
      });
  }, []);

  return null;
}
