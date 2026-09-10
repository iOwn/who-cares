import { renderAppIcon } from "../appIcon";

/** The 192×192 PWA icon referenced by `app/manifest.ts` (issue #90). */
export const dynamic = "force-static";

export function GET() {
  return renderAppIcon(192);
}
