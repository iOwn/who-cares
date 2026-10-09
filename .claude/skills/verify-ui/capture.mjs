#!/usr/bin/env node
/**
 * `/verify-ui` capture helper (issue #203).
 *
 *   node .claude/skills/verify-ui/capture.mjs --url <preview-url> --out <dir>
 *        [--scenes calendar-grid,inbox] [--schemes light,dark] [--no-seed]
 *
 * Seeds the Preview database (unless `--no-seed`), signs in as member `a`
 * through the `E2E_TEST_MODE` seam, then screenshots every scene across the
 * matrix in `matrix.mjs` and writes `measurements.json` next to the PNGs.
 *
 * Lives in the repo (not the scratchpad) so `playwright` resolves from the
 * repo's `node_modules`. Output goes to `--out` only — pass the session
 * scratchpad; nothing generated belongs in the tree.
 *
 * The Vercel bypass header comes from `VERCEL_AUTOMATION_BYPASS_SECRET` (set by
 * the operator in `.claude/settings.local.json`, #202). It is built here, not
 * imported from `e2e/vercel-bypass.ts` (a `.ts` file; this is a plain `.mjs`),
 * and it is attached per request to the preview origin only — never to the whole
 * context — so it cannot leak to a third-party host. The secret is never printed;
 * error text is scrubbed of it.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, request } from "playwright";
import {
  cellFilename,
  expandMatrix,
  isPreviewUrl,
  SCHEMES,
  SCHEMES_ALL,
  VIEWPORTS,
} from "./matrix.mjs";
import { SCENES } from "./scenes.mjs";

const SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

function scrub(text) {
  const s = String(text);
  return SECRET ? s.split(SECRET).join("[redacted]") : s;
}

function fail(message) {
  console.error(scrub(message));
  process.exit(1);
}

function parseArgs(argv) {
  const args = { seed: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-seed") args.seed = false;
    else if (a === "--url") args.url = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--schemes") args.schemes = argv[++i]?.split(",").filter(Boolean);
    else if (a === "--scenes") args.scenes = argv[++i]?.split(",").filter(Boolean);
    else fail(`unknown argument: ${a}`);
  }
  return args;
}

/** Same wording as `explainStatus` in `e2e/global-setup.ts`. */
function explainStatus(status) {
  if (status === 401)
    return " (401 this early means Vercel Authentication rejected the request, not the app — check VERCEL_AUTOMATION_BYPASS_SECRET.)";
  if (status === 404) return " (404 means E2E_TEST_MODE is not set on this deployment.)";
  return "";
}

const args = parseArgs(process.argv.slice(2));
if (!args.url || !args.out)
  fail(
    "usage: capture.mjs --url <preview-url> --out <dir> [--scenes a,b] [--schemes light,dark] [--no-seed]",
  );
if (!isPreviewUrl(args.url))
  fail(
    "refusing: --url must be an https://*.vercel.app preview (seeding truncates the database behind it).",
  );
if (!SECRET)
  fail(
    "VERCEL_AUTOMATION_BYPASS_SECRET is not set; see docs/testing.md (Driving a protected preview).",
  );

const origin = new URL(args.url).origin;
const bypass = {
  "x-vercel-protection-bypass": SECRET,
  "x-vercel-set-bypass-cookie": "true",
};
const sceneNames = args.scenes ?? SCENES.map((s) => s.name);
const schemes = args.schemes ?? SCHEMES;
if (!schemes.every((x) => SCHEMES_ALL.includes(x))) fail("--schemes takes light and/or dark");
const cells = expandMatrix(sceneNames, schemes); // throws on an unknown scene
await mkdir(args.out, { recursive: true });

// --- seed + login (APIRequestContext is single-origin, so headers are safe here) ---
const api = await request.newContext({ baseURL: origin, extraHTTPHeaders: bypass });
if (args.seed) {
  const seed = await api.post("/api/test/seed");
  if (!seed.ok())
    fail(`POST /api/test/seed failed (${seed.status()}).${explainStatus(seed.status())}`);
}
const login = await api.post("/api/test/login", { data: { member: "a" } });
if (!login.ok())
  fail(`POST /api/test/login failed (${login.status()}).${explainStatus(login.status())}`);
const storageState = await api.storageState();
await api.dispose();

// --- capture ---
const SCROLL_TO_BOTTOM = () => {
  window.scrollTo(0, document.documentElement.scrollHeight);
  for (const el of document.querySelectorAll("*")) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
      el.scrollTop = el.scrollHeight;
    }
  }
};

/** Raw numbers for the things a screenshot can't settle; the agent judges them. */
const MEASURE = () => {
  const r = (el) => {
    const b = el.getBoundingClientRect();
    return {
      left: b.left,
      top: b.top,
      right: b.right,
      bottom: b.bottom,
      width: b.width,
      height: b.height,
    };
  };
  const doc = document.documentElement;
  const pick = (selector) =>
    [...document.querySelectorAll(selector)].map((el) => ({ selector, ...r(el) }));
  const offenders = [...document.body.querySelectorAll("*")]
    .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 0.5)
    .slice(0, 5)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      class: String(el.className).slice(0, 80),
      ...r(el),
    }));
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    horizontalOverflow: doc.scrollWidth > doc.clientWidth,
    rects: [
      ...pick('[role="dialog"]'),
      ...pick("aside[aria-label]"),
      ...pick('[class*="ActionBar"]'),
    ],
    offenders,
  };
};

const browser = await chromium.launch();
const results = [];
let failures = 0;

// One context per (scene, viewport, scheme); the scroll states share it.
const groups = new Map();
for (const cell of cells) {
  const key = `${cell.scene}|${cell.width}|${cell.scheme}`;
  groups.set(key, [...(groups.get(key) ?? []), cell]);
}

for (const group of groups.values()) {
  const { scene: name, width, height, scheme } = group[0];
  const scene = SCENES.find((s) => s.name === name);
  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width, height },
    colorScheme: scheme,
    storageState: scene.auth ? storageState : undefined,
  });
  // Bypass headers go to the preview origin only.
  await context.route(
    (url) => url.origin === origin,
    (route) => route.continue({ headers: { ...route.request().headers(), ...bypass } }),
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(scrub(e.message)));
  page.on("console", (m) => m.type() === "error" && errors.push(scrub(m.text())));

  let runError;
  try {
    await scene.run(page);
    await page.waitForLoadState("networkidle").catch(() => {});
  } catch (e) {
    runError = scrub(e.message).split("\n")[0];
    failures++;
  }

  for (const cell of group) {
    if (cell.scroll === "bottom") await page.evaluate(SCROLL_TO_BOTTOM).catch(() => {});
    const file = cellFilename(cell);
    await page.screenshot({ path: path.join(args.out, file) });
    const measured = await page.evaluate(MEASURE).catch(() => ({}));
    results.push({
      ...cell,
      file,
      ...(runError ? { sceneError: runError } : {}),
      ...measured,
      errors: [...errors],
    });
  }
  await context.close();
}

await browser.close();
await writeFile(path.join(args.out, "measurements.json"), `${JSON.stringify(results, null, 2)}\n`);
console.log(`captured ${results.length} cells (${VIEWPORTS.length} viewports) -> ${args.out}`);
if (failures) fail(`${failures} scene run(s) failed; see sceneError in measurements.json`);
