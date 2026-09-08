import type { GlobalProvider } from "@ladle/react";
import "@/ui/tokens.css";
import "@/ui/mixins.css";
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
 * It also imports mixins.css once, right after tokens.css — the same order the
 * root layout uses — so the shared `.focus-ring` utility and the token `@layer`
 * are in scope for every story.
 */
export const Provider: GlobalProvider = ({ children }) => (
  <div className={styles.workbench}>{children}</div>
);
