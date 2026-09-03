/**
 * scripts/build-assets.ts — build-time asset pipeline (ADR 0002).
 *
 * OWNED BY A LATER NODE, NOT N1. This file is currently a stub: it wires
 * `npm run build:assets` end-to-end against the empty manifest so
 * `npm run build` succeeds today, and it documents what the real
 * implementation must do. The contract it must honour —
 * output directory, widths, filename convention — lives in
 * content/derived-assets.ts and is already final; this script should
 * consume those exports rather than re-deriving paths itself.
 *
 * The real implementation (N2) should, for every ReadablePublication in
 * content/publications.ts:
 *   - "pdf" sources: shell out to poppler (`pdftoppm`/`pdftocairo`) against
 *     content/sources/<sourceRef>, then re-encode each rendered page to
 *     WebP at PAGE_WIDTHS + a THUMBNAIL_WIDTH thumbnail.
 *   - "image-scans" sources: re-encode each content/sources/<slug>/<sourceFile>
 *     scan to the same set of WebP widths + thumbnail.
 *   - write every output using the derivedPagePath/derivedThumbnailPath/
 *     derivedCoverPath helpers from content/derived-assets.ts, and enforce
 *     the BYTES_PER_* budgets from that same file, failing the build on a
 *     regression rather than shipping it.
 *
 * Must be idempotent — safe to run repeatedly (the Docker build stage runs
 * it once per image build; a contributor may run `npm run dev` many times).
 */

import { publications } from "../content/publications.js";
import { DERIVED_ASSETS_ROOT, PAGE_WIDTHS, THUMBNAIL_WIDTH } from "../content/derived-assets.js";

async function main(): Promise<void> {
  console.log(`[build-assets] ${publications.length} publication(s) in the manifest.`);
  console.log(
    `[build-assets] derived output root: "${DERIVED_ASSETS_ROOT}", widths: [${PAGE_WIDTHS.join(", ")}], thumbnail: ${THUMBNAIL_WIDTH}px.`
  );

  if (publications.length === 0) {
    console.log("[build-assets] manifest is empty (N1 stub) — nothing to convert yet. Exiting 0.");
    return;
  }

  // TODO(later node): implement the real poppler + WebP pipeline described
  // above. Failing loudly here (rather than silently doing nothing) is
  // deliberate: it stops content/publications.ts from being populated
  // without the pipeline that's supposed to back it landing first.
  throw new Error(
    "[build-assets] the manifest is no longer empty, but the asset pipeline is still the N1 stub. " +
      "Implement scripts/build-assets.ts against content/derived-assets.ts (see ADR 0002) before shipping real Publication entries."
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
