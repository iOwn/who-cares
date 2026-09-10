/**
 * Notification delivery (issue #55) — the real `Notifier` behind the port every
 * functional slice calls, plus its Resend / web-push adapters and the 5-minute
 * coalescing flush.
 *
 * Not `next/*`-coupled: it reads `process.env` and the repository ports, nothing
 * more. Server Actions and the Vercel Cron handler are the callers.
 */

export {
  closureAddedNotification,
  closureCoalesceKey,
  patternChangedNotification,
  patternCoalesceKey,
} from "./copy";
export { dispatchAll, dispatchNotification } from "./dispatch";
export { getCronSecret, getResendConfig, getVapidConfig } from "./env";
export { createNotifier, flushPendingNotifications } from "./notifier";
export {
  createNotificationServices,
  type NotificationServices,
  notificationServicesFor,
} from "./services";
