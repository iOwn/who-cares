import { renderAppIcon } from "../appIcon";

/** The 512×512 PWA icon referenced by `app/manifest.ts` (issue #90). */
export const dynamic = "force-static";

export function GET() {
  return renderAppIcon(512);
}
