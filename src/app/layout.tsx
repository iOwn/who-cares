import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito } from "next/font/google";
import type { ReactNode } from "react";
import "@/ui/tokens.css";

/**
 * The two families, with the weights pinned in docs/design-system.md "Fonts".
 * `next/font/google` self-hosts them at build time — no runtime request to
 * Google — and exposes each as a CSS custom property on whatever element gets
 * the returned `variable` class. `tokens.css` composes `--font-body` /
 * `--font-display` from these two, together with the fallback stacks.
 *
 * The weights here MUST match the Google Fonts URL in .ladle/config.mjs
 * (`googleFontsHref`). A parity test (src/app/fonts.test.ts) ensures drift is
 * caught.
 */
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  display: "swap",
  variable: "--font-nunito",
});

const baloo = Baloo_2({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  display: "swap",
  variable: "--font-baloo",
});

export const metadata: Metadata = {
  title: "WhoCares",
  description: "Household pickup coordination for the days nobody's sure who's got the kids.",
};

/**
 * Pinch-zoom MUST stay available (WCAG 2.2 §1.4.4 Resize Text): no
 * `user-scalable=no`, no `maximum-scale=1`. Next's default viewport meta
 * already allows it; this makes the requirement explicit so a later
 * "fix the iOS zoom-on-focus jump" change has to argue with a comment.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${nunito.variable} ${baloo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
