/**
 * Pure parts of `/verify-ui` (issue #203): the capture matrix, filenames, the
 * UI-diff gate and the diff -> scene mapping, and the preview-host guard. No
 * I/O, no browser, so `matrix.test.mjs` covers them under `node --test`.
 */
import { SCENES } from "./scenes.mjs";

/**
 * 390 / 1280 straddle `breakpoints.md` (768) in `src/ui/breakpoints.ts`, where
 * the inbox flips between a full-screen route and a desktop side panel.
 */
export const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];
/**
 * Dark mode is a stub in `src/ui/tokens.css` ("OUT OF SCOPE for v1", #27): a dark
 * capture is byte-identical to the light one. So the default is light only; pass
 * `--schemes light,dark` (or `SCHEMES_ALL` to `expandMatrix`) once dark lands.
 */
export const SCHEMES_ALL = ["light", "dark"];
export const SCHEMES = ["light"];
export const SCROLLS = ["top", "bottom"];

export const ALL_SCENE_NAMES = SCENES.map((s) => s.name);

/** One cell per scene x viewport x scheme x scroll; scenes that don't scroll get `top` only. */
export function expandMatrix(sceneNames = ALL_SCENE_NAMES, schemes = SCHEMES) {
  const cells = [];
  for (const name of sceneNames) {
    const scene = SCENES.find((s) => s.name === name);
    if (!scene) throw new Error(`unknown scene: ${name}`);
    for (const { width, height } of VIEWPORTS) {
      for (const scheme of schemes) {
        for (const scroll of scene.scrolls ? SCROLLS : ["top"]) {
          cells.push({ scene: name, width, height, scheme, scroll });
        }
      }
    }
  }
  return cells;
}

export function cellFilename({ scene, width, scheme, scroll }) {
  return `${scene}__${width}__${scheme}__${scroll}.png`;
}

/** A path that can change what a user sees. Tests and stories don't. */
export function isUiPath(path) {
  if (/\.(test|stories)\.[cm]?[jt]sx?$/.test(path)) return false;
  return /^src\/ui\//.test(path) || /^src\/app\/.+\.(tsx|css)$/.test(path);
}

/** Shared code that can show up on any screen. */
function isGlobalUiPath(path) {
  return /^src\/ui\//.test(path) || /^src\/app\/(globals\.css|layout\.tsx)$/.test(path);
}

/**
 * Scenes worth capturing for a PR's changed files; `[]` means "no UI change,
 * skip". A UI file no scene claims is treated as global rather than dropped:
 * looking at too much is cheaper than missing a screen.
 */
export function scenesForDiff(paths) {
  const ui = paths.filter(isUiPath);
  if (ui.length === 0) return [];
  if (ui.some(isGlobalUiPath)) return [...ALL_SCENE_NAMES];

  const hit = new Set();
  for (const path of ui) {
    const owners = SCENES.filter((s) => s.owners.some((re) => re.test(path)));
    if (owners.length === 0) return [...ALL_SCENE_NAMES];
    for (const s of owners) hit.add(s.name);
  }
  return ALL_SCENE_NAMES.filter((name) => hit.has(name));
}

/**
 * Seeding truncates the database behind the URL, so only a Vercel preview host
 * is acceptable. (Production also 404s the seam without `E2E_TEST_MODE`; this is
 * the second guard.)
 */
export function isPreviewUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.hostname.endsWith(".vercel.app");
}
