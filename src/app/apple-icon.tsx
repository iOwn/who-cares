import { renderAppIcon } from "./appIcon";

/**
 * The iOS Home-Screen icon (issue #90). Next injects the matching
 * `<link rel="apple-touch-icon">`; iOS 16.4+ needs the app installed to the
 * Home Screen before it will deliver web push at all, so this icon is on the
 * critical path, not decoration.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return renderAppIcon(180);
}
