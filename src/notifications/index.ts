/**
 * Notification delivery (issue #55) — the real `Notifier` behind the port every
 * functional slice calls, plus its Gmail SMTP / web-push adapters and the
 * per-action bundling boundary (ADR-0018).
 *
 * Not `next/*`-coupled: it reads `process.env` and the repository ports, nothing
 * more. Server Actions and the Vercel Cron handler are the callers.
 */

export { closureAddedNotification, patternChangedNotification } from "./copy";
export { dispatchAll, dispatchNotification } from "./dispatch";
export { getCronSecret, getGmailConfig, getVapidConfig } from "./env";
export { createNotifier } from "./notifier";
export {
  createNotificationServices,
  type NotificationServices,
  notificationServicesFor,
} from "./services";
