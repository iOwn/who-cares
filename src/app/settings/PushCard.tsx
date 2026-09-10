"use client";

import { BellRing, Share } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { announce, Button, Callout, Surface } from "@/ui";
import { describeUserAgent, formatLastActive } from "./deviceInfo";
import { needsIOSInstall } from "./pushSupport";
import styles from "./SettingsScreen.module.css";
import { usePushEnrollment } from "./usePushEnrollment";

export interface PushBrowserView {
  readonly endpoint: string;
  /** Raw `User-Agent` captured at subscribe time; `null` if the client withheld it. */
  readonly userAgent: string | null;
  /** ISO timestamp the subscription row was created. */
  readonly addedAt: string;
}

interface Props {
  readonly browsers: readonly PushBrowserView[];
}

/**
 * "Push notifications on this device" (issue #90).
 *
 * Enrollment is per-browser: this card enables/disables push *here*, shows the
 * current permission state, and lists every browser this member has registered
 * so a stale one can be dropped. Email is always the guaranteed channel
 * (SPEC.md), so every copy path says so and nothing here blocks.
 *
 * On iOS, web push only works once the app is installed to the Home Screen
 * (16.4+) — when that's the situation we show the install steps instead of a
 * dead "Enable" button.
 */
export function PushCard({ browsers }: Props) {
  const router = useRouter();
  const { state, currentEndpoint, enable, disable, removeEndpoint } = usePushEnrollment(() =>
    router.refresh(),
  );

  const [iosInstall, setIosInstall] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  useEffect(() => {
    setNow(new Date());
    setIosInstall(
      needsIOSInstall({
        userAgent: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
        standalone: window.matchMedia("(display-mode: standalone)").matches,
      }),
    );
  }, []);

  async function onEnable() {
    await enable();
    announce("Push notifications are on for this device. Email still arrives too.");
  }
  async function onDisable() {
    await disable();
    announce("Push notifications are off for this device. You’ll still get emails.");
  }
  async function onRemove(browser: PushBrowserView) {
    setRemoving(browser.endpoint);
    try {
      await removeEndpoint(browser.endpoint);
      announce(`${describeUserAgent(browser.userAgent)} will no longer get push notifications.`);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Surface className={styles.card}>
      <div className={styles.cardText}>
        <p className={styles.cardTitle}>Push notifications</p>
        <p className={styles.cardBody}>
          Get a notification on this device the moment plans change. Email always arrives as well —
          it’s the channel we count on, so you’ll never miss anything if push is off.
        </p>
      </div>

      {/*
       * iOS onboarding takes priority: on a plain iOS Safari tab `PushManager` /
       * `Notification` are undefined, so the hook reports `unsupported` — but
       * push *does* work there once the app is installed to the Home Screen, so
       * the install steps must show instead of the generic "can't" message.
       */}
      {iosInstall && state !== "enabled" && state !== "disabling" && (
        <Callout tone="neutral" icon={Share}>
          On iPhone and iPad, add WhoCares to your Home Screen first: tap the Share button, then
          “Add to Home Screen”. Open it from there and turn on notifications from this screen.
        </Callout>
      )}

      {!iosInstall && state === "unsupported" && (
        <Callout tone="neutral" icon={BellRing}>
          This browser can’t show push notifications. You’ll keep getting every update by email.
        </Callout>
      )}

      {!iosInstall && state === "unconfigured" && (
        <Callout tone="neutral" icon={BellRing}>
          Push notifications aren’t set up for this deployment yet. Email is delivering every update
          in the meantime.
        </Callout>
      )}

      {!iosInstall && state === "denied" && (
        <Callout tone="neutral" icon={BellRing}>
          Notifications are blocked for this site in your browser settings. Re-allow them there to
          turn push on. Email keeps working regardless.
        </Callout>
      )}

      {state === "error" && (
        <Callout tone="danger" role="alert">
          That didn’t work. Your email notifications are unaffected — try the switch again in a
          moment.
        </Callout>
      )}

      {(state === "disabled" || state === "enabling") && !iosInstall && (
        <Button variant="secondary" onPress={onEnable} isDisabled={state === "enabling"}>
          {state === "enabling" ? "Turning on…" : "Turn on for this device"}
        </Button>
      )}

      {(state === "enabled" || state === "disabling") && (
        <Button
          variant="ghost"
          tone="danger"
          onPress={onDisable}
          isDisabled={state === "disabling"}
        >
          {state === "disabling" ? "Turning off…" : "Turn off for this device"}
        </Button>
      )}

      {browsers.length > 0 && (
        <ul className={styles.deviceList} aria-label="Browsers registered for push">
          {browsers.map((browser) => (
            <li key={browser.endpoint}>
              <Surface className={styles.deviceRow}>
                <span className={styles.deviceIcon} aria-hidden>
                  <BellRing size={18} aria-hidden />
                </span>
                <div className={styles.deviceText}>
                  <p className={styles.deviceName}>
                    {describeUserAgent(browser.userAgent)}
                    {browser.endpoint === currentEndpoint && (
                      <span className={styles.thisDevice}> · This device</span>
                    )}
                  </p>
                  <p className={styles.deviceMeta}>
                    {now ? `Added ${formatLastActive(new Date(browser.addedAt), now)}` : " "}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  tone="danger"
                  size="sm"
                  aria-label={`Remove ${describeUserAgent(browser.userAgent)}`}
                  onPress={() => onRemove(browser)}
                  isDisabled={removing === browser.endpoint}
                >
                  {removing === browser.endpoint ? "Removing…" : "Remove"}
                </Button>
              </Surface>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
