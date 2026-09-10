import { ImageResponse } from "next/og";

/**
 * The WhoCares app mark, rendered at whatever size the caller needs (issue #90).
 *
 * One generator feeds three consumers: `icon-192.png` / `icon-512.png` (the PWA
 * manifest, Android install) and `apple-icon` (the iOS Home-Screen icon). Keeping
 * it code-generated means no binary PNGs in the tree and the mark stays in sync
 * with the design tokens by hand-copied value (`--blue-500`, `--sand-50`).
 *
 * The mark itself is a single ring — the app's promise of *one resolved answer
 * per day*. Only plain `<div>`s with `background` / `borderRadius`, which is all
 * Satori (behind `ImageResponse`) renders reliably.
 */
const BLUE = "#3d7dd8";
const SAND = "#fbfaf7";

export function renderAppIcon(size: number): ImageResponse {
  const ring = Math.round(size * 0.56);
  const border = Math.max(2, Math.round(size * 0.12));

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BLUE,
      }}
    >
      <div
        style={{
          width: ring,
          height: ring,
          borderRadius: "50%",
          border: `${border}px solid ${SAND}`,
        }}
      />
    </div>,
    { width: size, height: size },
  );
}
