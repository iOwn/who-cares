import type { MetadataRoute } from "next";

/**
 * The PWA web app manifest (issue #90, SPEC.md "Push").
 *
 * Its reason for existing is install-to-Home-Screen: on iOS 16.4+ that is the
 * *only* path to web push, and the onboarding in `/settings` walks a parent
 * through it. `display: "standalone"` is what makes the installed app open
 * chrome-less; `PushCard` reads the same `display-mode: standalone` media query
 * to know the install succeeded.
 *
 * Icons are code-generated route handlers (`app/icon-192.png`, `app/icon-512.png`,
 * `app/appIcon.tsx`) — no binary PNGs in the tree. The same file is offered as
 * `purpose: "maskable"`: the mark is a centred ring inside the middle ~56%, well
 * within the maskable safe zone (the inner 80%), so a platform mask crops only
 * padding. If the mark ever gains detail near the edge, split these out.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WhoCares",
    short_name: "WhoCares",
    description: "Household pickup coordination for the days nobody's sure who's got the kids.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#3d7dd8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
