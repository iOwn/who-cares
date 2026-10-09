import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALL_SCENE_NAMES,
  cellFilename,
  expandMatrix,
  isPreviewUrl,
  isUiPath,
  SCHEMES_ALL,
  scenesForDiff,
} from "./matrix.mjs";
import { SCENES } from "./scenes.mjs";

test("expandMatrix: default is light only; scrolling scenes get 2x2, non-scrolling get 2x1", () => {
  const scrolling = SCENES.filter((s) => s.scrolls).length;
  const still = SCENES.length - scrolling;
  const cells = expandMatrix();
  assert.equal(cells.length, scrolling * 4 + still * 2);
  assert.ok(cells.every((c) => (c.width === 390 || c.width === 1280) && c.scheme === "light"));
});

test("expandMatrix: with both schemes, scrolling scenes get 2x2x2 and non-scrolling 2x2", () => {
  const scrolling = SCENES.filter((s) => s.scrolls).length;
  const still = SCENES.length - scrolling;
  const cells = expandMatrix(ALL_SCENE_NAMES, SCHEMES_ALL);
  assert.equal(cells.length, scrolling * 8 + still * 4);
  assert.ok(cells.some((c) => c.scheme === "dark" && c.scroll === "bottom"));
});

test("expandMatrix: unknown scene throws", () => {
  assert.throws(() => expandMatrix(["nope"]), /unknown scene/);
});

test("cellFilename: unique per cell", () => {
  const names = expandMatrix(ALL_SCENE_NAMES, SCHEMES_ALL).map(cellFilename);
  assert.equal(new Set(names).size, names.length);
  assert.equal(
    cellFilename({ scene: "im-out", width: 390, scheme: "dark", scroll: "top" }),
    "im-out__390__dark__top.png",
  );
});

test("isUiPath: tsx/css under src/app and anything under src/ui, never tests or stories", () => {
  assert.equal(isUiPath("src/app/Inbox.tsx"), true);
  assert.equal(isUiPath("src/app/Inbox.module.css"), true);
  assert.equal(isUiPath("src/ui/ActionBar/ActionBar.tsx"), true);
  assert.equal(isUiPath("src/ui/ActionBar/ActionBar.stories.tsx"), false);
  assert.equal(isUiPath("src/ui/Dialog/Dialog.test.tsx"), false);
  assert.equal(isUiPath("src/app/refreshPolicy.ts"), false);
  assert.equal(isUiPath("docs/testing.md"), false);
});

test("scenesForDiff: docs-only and domain-only diffs are skipped", () => {
  assert.deepEqual(scenesForDiff(["docs/testing.md", "CLAUDE.md"]), []);
  assert.deepEqual(scenesForDiff(["src/domain/services/dayState.ts"]), []);
});

test("scenesForDiff: a shared primitive or global stylesheet maps to every scene", () => {
  assert.deepEqual(scenesForDiff(["src/ui/ActionBar/ActionBar.module.css"]), ALL_SCENE_NAMES);
  assert.deepEqual(scenesForDiff(["src/ui/tokens.css"]), ALL_SCENE_NAMES);
  assert.deepEqual(scenesForDiff(["src/app/globals.css"]), ALL_SCENE_NAMES);
});

test("scenesForDiff: settings code maps to the settings scenes only", () => {
  assert.deepEqual(scenesForDiff(["src/app/settings/SettingsShell.tsx"]), [
    "settings",
    "settings-household",
  ]);
  assert.deepEqual(scenesForDiff(["src/app/settings/household/page.tsx"]), ["settings-household"]);
});

test("scenesForDiff: a feature file maps to its own scenes", () => {
  assert.deepEqual(scenesForDiff(["src/app/Inbox.module.css"]), ["inbox"]);
  assert.deepEqual(scenesForDiff(["src/app/AbsenceForm.tsx"]), ["im-out"]);
});

test("scenesForDiff: a UI file no scene claims falls back to every scene", () => {
  assert.deepEqual(scenesForDiff(["src/app/PushNudge.tsx"]), ALL_SCENE_NAMES);
});

test("isPreviewUrl: only https vercel.app hosts", () => {
  assert.equal(isPreviewUrl("https://who-cares-abc-team.vercel.app"), true);
  assert.equal(isPreviewUrl("http://who-cares-abc-team.vercel.app"), false);
  assert.equal(isPreviewUrl("https://who-cares.example.com"), false);
  assert.equal(isPreviewUrl("https://evil.com/.vercel.app"), false);
  assert.equal(isPreviewUrl("not a url"), false);
});
