/**
 * Dev harness entry — mounts Reader against FakePageSource so the whole
 * module can be exercised (`npm run dev`, then load harness.html) without
 * waiting on scripts/build-assets.ts or a real Publication manifest entry.
 * Not part of the production build (vite.config.ts's resolveEntries()
 * never lists it) — reached directly via the dev server during
 * development only.
 */

import { Reader } from "../reader";
import { FakePageSource } from "../../../page-sources/FakePageSource";
import type { PageAsset } from "../../../page-sources/PageSource";

const PAGE_COUNT = 24;
const WIDTH = 800;
const HEIGHT = 1200;

/** Renders a distinguishable placeholder page (big page number, a colour that shifts per page) so turning/zooming/panning is visually obvious while driving the harness. */
function renderPageDataUrl(pageNumber: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("harness: 2D canvas context unavailable");

  const hue = (pageNumber * 47) % 360;
  ctx.fillStyle = `hsl(${hue}, 35%, 92%)`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = "rgba(123,61,0,0.35)";
  ctx.lineWidth = 6;
  ctx.strokeRect(20, 20, WIDTH - 40, HEIGHT - 40);

  ctx.fillStyle = "#7B3D00";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 160px sans-serif";
  ctx.fillText(String(pageNumber), WIDTH / 2, HEIGHT / 2);
  ctx.font = "28px sans-serif";
  ctx.fillText("reader dev harness", WIDTH / 2, HEIGHT / 2 + 140);

  return canvas.toDataURL("image/png");
}

function buildPages(): Record<number, PageAsset> {
  const pages: Record<number, PageAsset> = {};
  for (let i = 1; i <= PAGE_COUNT; i++) {
    pages[i] = {
      pageNumber: i,
      intrinsicWidth: WIDTH,
      intrinsicHeight: HEIGHT,
      candidates: [{ width: WIDTH, url: renderPageDataUrl(i) }],
    };
  }
  return pages;
}

async function main(): Promise<void> {
  const container = document.querySelector<HTMLElement>("#reader-root");
  if (!container) throw new Error("harness: #reader-root not found in harness.html");

  const pageSource = new FakePageSource({
    pageCount: PAGE_COUNT,
    pages: buildPages(),
    delayMs: 150, // deliberately non-zero: exercises the loading/prefetch/abort paths, not just the same-microtask case
  });

  const reader = new Reader({
    container,
    pageSource,
    publicationSlug: "dev-harness",
    publicationTitle: "Reader Dev Harness",
  });

  await reader.mount();

  // Exposed for manual poking from the devtools console while driving the harness.
  (window as unknown as { __reader: Reader }).__reader = reader;
}

main().catch((err: unknown) => {
  console.error("[harness] failed to mount", err);
  const container = document.querySelector<HTMLElement>("#reader-root");
  if (container) container.textContent = `Failed to mount reader: ${String(err)}`;
});
