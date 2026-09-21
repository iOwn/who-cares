/**
 * The colour the OS paints around the app (issue #163): the status bar in the
 * installed app (iOS 15+ standalone and Android Chrome both read `theme-color`),
 * Android's task-switcher chrome, and the splash behind the icon.
 *
 * It is the header's ground — `--sand-50` / `--color-bg` in src/ui/tokens.css —
 * so the status bar and the sticky header under it read as one surface. Not
 * the brand blue: that is the icon's colour (src/app/appIcon.tsx), a different
 * role. Both `layout.tsx` (`viewport.themeColor`) and `manifest.ts`
 * (`theme_color`, `background_color`) import this rather than repeating the
 * literal; src/app/themeColor.test.ts pins it to the token.
 *
 * Kept as a literal, not a `var()`: `<meta name="theme-color">` and the
 * manifest are read by the platform, outside CSS. When dark mode lands
 * (tokens.css stub) this grows a `media` variant instead of changing value.
 */
export const THEME_COLOR = "#fbfaf7";
