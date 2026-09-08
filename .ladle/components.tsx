import type { GlobalProvider } from "@ladle/react";
import "@/ui/tokens.css";
import "./workbench.css";
import styles from "./workbench.module.css";

/**
 * The Ladle catalogue's root wrapper — the workbench equivalent of
 * src/app/layout.tsx. It does the three things the Next root layout does for
 * the real app:
 *
 *   1. imports tokens.css exactly once, so every story renders inside the same
 *      `@layer tokens` cascade the app has;
 *   2. supplies --font-nunito / --font-baloo (workbench.css — see the note in
 *      .ladle/config.mjs about why next/font can't run here);
 *   3. paints a token-only frame around the story (workbench.module.css).
 *
 * The catalogue is empty until #42 lands the first primitives; booting it now
 * still proves the whole pipeline, because the frame below is styled purely
 * from semantic tokens.
 */
export const Provider: GlobalProvider = ({ children }) => (
  <div className={styles.workbench}>{children}</div>
);
