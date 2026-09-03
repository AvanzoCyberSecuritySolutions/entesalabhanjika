/**
 * scripts/build-assets.ts — build-time asset pipeline (ADR 0002).
 *
 * For every ReadablePublication in content/publications.ts, produces WebP
 * page images at PAGE_WIDTHS + a THUMBNAIL_WIDTH thumbnail, plus a cover
 * thumbnail set, under public/derived/ (gitignored — see content/derived-
 * assets.ts, the single source of truth for output paths/filenames).
 * Image-scans Publications re-encode their source JPEGs directly; pdf
 * Publications are first rasterized page-by-page with poppler's
 * `pdftoppm`, then fed through the same sharp re-encode step — from that
 * point on the two kinds are handled identically, which is exactly why
 * src/page-sources/DerivedImagePageSource (the runtime side) doesn't need
 * to know which kind produced a given Publication's derived files.
 *
 * Also derives a single cover image (from content/sources/placeholders/)
 * for each PlaceholderPublication, by slug convention:
 * content/sources/placeholders/<slug>-cover.jpg.
 *
 * Writes one sidecar JSON per Publication (content/derived-assets.ts
 * DerivedPublicationSidecar) recording, per page, intrinsic dimensions and
 * which widths were actually produced — the runtime PageSource reads this
 * instead of guessing.
 *
 * Idempotent / cached: a page is skipped (no rasterize, no re-encode) if
 * its previous sidecar entry exists and every file it names is still on
 * disk and newer than the source it came from. Safe to run repeatedly.
 *
 * Enforces BYTES_PER_DERIVED_IMAGE (ADR 0002) across every derived image
 * this run produced or reused, failing the build and listing the worst
 * offenders if any file is over budget.
 */

import { access, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { constants as FS } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { publications } from "../content/publications.js";
import type { ReadablePublication, PlaceholderPublication, CoverCrop } from "../content/publication.js";
import {
  DERIVED_ASSETS_ROOT,
  PAGE_WIDTHS,
  THUMBNAIL_WIDTH,
  BYTES_PER_DERIVED_IMAGE,
  BYTES_PER_HOME_PAGE,
  BYTES_PER_READER_PAGE,
  derivedPublicationDir,
  derivedPagesDir,
  derivedPagePath,
  derivedThumbnailPath,
  derivedCoverPath,
  derivedSidecarPath,
  widthsFitting,
  type DerivedPageMetadata,
  type DerivedPublicationSidecar,
} from "../content/derived-assets.js";

const execFileAsync = promisify(execFile);

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcesDir = resolve(rootDir, "content/sources");
const placeholdersDir = resolve(sourcesDir, "placeholders");

/** Encode quality steps tried in order until the output fits BYTES_PER_DERIVED_IMAGE, or we run out. */
const WEBP_QUALITY_STEPS = [82, 75, 68, 60, 52, 44, 35] as const;

/**
 * sharp's webp `effort` (0-6, default 4): higher spends more CPU per image
 * to squeeze out a meaningfully smaller file at the same quality (measured
 * ~5-15% smaller at effort 6 vs. the default on this project's scans).
 * Worth it here: page count is small (~155) and this is a build step, not
 * a request-time one.
 */
const WEBP_EFFORT = 6;

/** DPI used to rasterize PDF pages. Chosen so a typical A4-ish PDF page (~1240x1753pt) renders wider than the largest PAGE_WIDTHS candidate (1600px), so nothing ever needs upscaling. */
const PDF_RASTER_DPI = 150;

interface Stats {
  filesWritten: number;
  filesReused: number;
  totalBytes: number;
  largest: { path: string; bytes: number } | null;
  offenders: { path: string; bytes: number }[];
}

const stats: Stats = { filesWritten: 0, filesReused: 0, totalBytes: 0, largest: null, offenders: [] };

function recordOutput(relPath: string, bytes: number, written: boolean): void {
  stats.totalBytes += bytes;
  if (written) stats.filesWritten++;
  else stats.filesReused++;
  if (!stats.largest || bytes > stats.largest.bytes) stats.largest = { path: relPath, bytes };
  if (bytes > BYTES_PER_DERIVED_IMAGE) stats.offenders.push({ path: relPath, bytes });
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, FS.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function mtimeMs(path: string): Promise<number> {
  return (await stat(path)).mtimeMs;
}

/** True if `outPath` exists and is at least as new as `sourceMs`. */
async function isFresh(outPath: string, sourceMs: number): Promise<boolean> {
  if (!(await exists(outPath))) return false;
  return (await mtimeMs(outPath)) >= sourceMs;
}

function absDerived(relPath: string): string {
  return resolve(rootDir, relPath);
}

/**
 * Resize+encode one sharp pipeline input to WebP at `width`, retrying at
 * lower quality if the result is over budget, and record it for the final
 * budget report. `width` must already be <= the input's intrinsic width —
 * callers are responsible for that (never-upscale is a filtering decision
 * made before this is called, not something this function enforces).
 */
async function encodeWebp(inputPath: string, outRelPath: string, width: number, crop?: { left: number; top: number; width: number; height: number }): Promise<void> {
  const outAbs = absDerived(outRelPath);
  let lastBytes = 0;
  for (const quality of WEBP_QUALITY_STEPS) {
    let pipeline = sharp(inputPath);
    if (crop) pipeline = pipeline.extract(crop);
    const buffer = await pipeline
      .resize({ width, withoutEnlargement: true })
      .webp({ quality, effort: WEBP_EFFORT })
      .toBuffer();
    lastBytes = buffer.length;
    if (buffer.length <= BYTES_PER_DERIVED_IMAGE || quality === WEBP_QUALITY_STEPS[WEBP_QUALITY_STEPS.length - 1]) {
      await writeFile(outAbs, buffer);
      recordOutput(outRelPath, buffer.length, true);
      return;
    }
  }
  // Unreachable (loop always writes on its last iteration), but keeps TS happy about lastBytes usage.
  void lastBytes;
}

async function reuseExisting(outRelPath: string): Promise<void> {
  const bytes = (await stat(absDerived(outRelPath))).size;
  recordOutput(outRelPath, bytes, false);
}

/** Renders every page of a PDF to JPEG in a fresh temp directory via poppler's pdftoppm, returns paths sorted by page number ascending. */
async function rasterizePdf(pdfAbsPath: string): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), "build-assets-pdf-"));
  const prefix = join(dir, "page");
  await execFileAsync("pdftoppm", ["-jpeg", "-r", String(PDF_RASTER_DPI), pdfAbsPath, prefix]);
  const files = await readdir(dir);
  const numbered = files
    .map((f) => {
      const m = /-(\d+)\.jpg$/.exec(f);
      return m ? { file: join(dir, f), n: Number(m[1]) } : null;
    })
    .filter((x): x is { file: string; n: number } => x !== null)
    .sort((a, b) => a.n - b.n);
  return numbered.map((x) => x.file);
}

async function cleanupTempDir(files: string[]): Promise<void> {
  if (files.length === 0) return;
  const dir = dirname(files[0]!);
  await rm(dir, { recursive: true, force: true });
}

async function loadPreviousSidecar(slug: string): Promise<DerivedPublicationSidecar | null> {
  const path = absDerived(derivedSidecarPath(slug));
  if (!(await exists(path))) return null;
  try {
    return JSON.parse(await readFile(path, "utf-8")) as DerivedPublicationSidecar;
  } catch {
    return null;
  }
}

/** Whether a previous sidecar entry for this page is still fully backed by on-disk files newer than `sourceMs`. */
async function previousEntryIsFresh(slug: string, prev: DerivedPageMetadata | undefined, sourceMs: number): Promise<boolean> {
  if (!prev) return false;
  for (const w of prev.widths) {
    if (!(await isFresh(derivedPagePath(slug, prev.pageNumber, w), sourceMs))) return false;
  }
  if (prev.hasThumbnail && !(await isFresh(derivedThumbnailPath(slug, prev.pageNumber), sourceMs))) return false;
  return true;
}

async function processImageScanPage(
  slug: string,
  pageNumber: number,
  sourceAbsPath: string,
  prev: DerivedPageMetadata | undefined
): Promise<DerivedPageMetadata> {
  const sourceMs = await mtimeMs(sourceAbsPath);
  if (await previousEntryIsFresh(slug, prev, sourceMs)) {
    for (const w of prev!.widths) await reuseExisting(derivedPagePath(slug, pageNumber, w));
    if (prev!.hasThumbnail) await reuseExisting(derivedThumbnailPath(slug, pageNumber));
    return prev!;
  }

  const meta = await sharp(sourceAbsPath).metadata();
  const intrinsicWidth = meta.width ?? 0;
  const intrinsicHeight = meta.height ?? 0;
  const widths = widthsFitting(intrinsicWidth);

  for (const w of widths) {
    await encodeWebp(sourceAbsPath, derivedPagePath(slug, pageNumber, w), w);
  }
  const hasThumbnail = intrinsicWidth > 0;
  if (hasThumbnail) {
    await encodeWebp(sourceAbsPath, derivedThumbnailPath(slug, pageNumber), Math.min(THUMBNAIL_WIDTH, intrinsicWidth));
  }

  return { pageNumber, intrinsicWidth, intrinsicHeight, widths, hasThumbnail };
}

async function processRasterizedPage(
  slug: string,
  pageNumber: number,
  rasterAbsPath: string
): Promise<DerivedPageMetadata> {
  const meta = await sharp(rasterAbsPath).metadata();
  const intrinsicWidth = meta.width ?? 0;
  const intrinsicHeight = meta.height ?? 0;
  const widths = widthsFitting(intrinsicWidth);

  for (const w of widths) {
    await encodeWebp(rasterAbsPath, derivedPagePath(slug, pageNumber, w), w);
  }
  const hasThumbnail = intrinsicWidth > 0;
  if (hasThumbnail) {
    await encodeWebp(rasterAbsPath, derivedThumbnailPath(slug, pageNumber), Math.min(THUMBNAIL_WIDTH, intrinsicWidth));
  }
  return { pageNumber, intrinsicWidth, intrinsicHeight, widths, hasThumbnail };
}

function cropRectFor(crop: CoverCrop, fullWidth: number, fullHeight: number): { left: number; top: number; width: number; height: number } {
  return {
    left: 0,
    top: 0,
    width: Math.max(1, Math.round(fullWidth * crop.widthRatio)),
    height: Math.max(1, Math.round(fullHeight * crop.heightRatio)),
  };
}

async function processCover(slug: string, sourceAbsPath: string, coverCrop: CoverCrop | undefined): Promise<void> {
  const sourceMs = await mtimeMs(sourceAbsPath);
  const meta = await sharp(sourceAbsPath).metadata();
  const fullWidth = meta.width ?? 0;
  const fullHeight = meta.height ?? 0;

  const crop = coverCrop ? cropRectFor(coverCrop, fullWidth, fullHeight) : undefined;
  const effectiveWidth = crop ? crop.width : fullWidth;
  const widths = widthsFitting(effectiveWidth);

  for (const w of widths) {
    const outRel = derivedCoverPath(slug, w);
    if (await isFresh(absDerived(outRel), sourceMs)) {
      await reuseExisting(outRel);
    } else {
      await encodeWebp(sourceAbsPath, outRel, w, crop);
    }
  }
}

async function processPlaceholderCover(pub: PlaceholderPublication): Promise<void> {
  const candidates = [`${pub.slug}-cover.jpg`, `${pub.slug}-cover.png`, `${pub.slug}-cover.jpeg`];
  let sourceAbsPath: string | null = null;
  for (const c of candidates) {
    const p = join(placeholdersDir, c);
    if (await exists(p)) {
      sourceAbsPath = p;
      break;
    }
  }
  if (!sourceAbsPath) {
    throw new Error(
      `[build-assets] Publication "${pub.slug}" (placeholder) has no cover source. Expected one of: ${candidates
        .map((c) => `content/sources/placeholders/${c}`)
        .join(", ")}`
    );
  }

  // Same helper a readable Publication's cover goes through — a
  // PlaceholderPublication's cover must be exactly as responsive
  // (all of PAGE_WIDTHS, never upscaled past intrinsic width) as a
  // readable one's, because content/publications.ts builds both kinds'
  // `cover.candidates` the same way (derivedCoverCandidates(slug)), and
  // that promise has to actually hold on disk.
  await processCover(pub.slug, sourceAbsPath, undefined);
}

async function processReadablePublication(pub: ReadablePublication): Promise<void> {
  await mkdir(absDerived(derivedPagesDir(pub.slug)), { recursive: true });
  const prevSidecar = await loadPreviousSidecar(pub.slug);
  const prevByPage = new Map((prevSidecar?.pages ?? []).map((p) => [p.pageNumber, p]));

  const pageMeta: DerivedPageMetadata[] = [];

  if (pub.pageSourceKind === "image-scans") {
    for (const entry of pub.pages) {
      const sourceFile = entry.sourceFile;
      if (!sourceFile) {
        throw new Error(
          `[build-assets] Publication "${pub.slug}" page ${entry.pageNumber} is image-scans but has no sourceFile.`
        );
      }
      const sourceAbsPath = join(sourcesDir, pub.sourceRef, sourceFile);
      if (!(await exists(sourceAbsPath))) {
        throw new Error(
          `[build-assets] Publication "${pub.slug}" page ${entry.pageNumber}: missing source file ` +
            `content/sources/${pub.sourceRef}/${sourceFile}`
        );
      }
      pageMeta.push(await processImageScanPage(pub.slug, entry.pageNumber, sourceAbsPath, prevByPage.get(entry.pageNumber)));
    }

    const coverEntry = pub.pages.find((p) => p.pageNumber === pub.coverPage);
    if (!coverEntry?.sourceFile) {
      throw new Error(`[build-assets] Publication "${pub.slug}": coverPage ${pub.coverPage} not found among its pages.`);
    }
    await processCover(pub.slug, join(sourcesDir, pub.sourceRef, coverEntry.sourceFile), pub.coverCrop);
  } else {
    const pdfAbsPath = join(sourcesDir, pub.sourceRef);
    if (!(await exists(pdfAbsPath))) {
      throw new Error(`[build-assets] Publication "${pub.slug}": missing source file content/sources/${pub.sourceRef}`);
    }
    const pdfMs = await mtimeMs(pdfAbsPath);

    const dirtyPages: number[] = [];
    for (const entry of pub.pages) {
      if (await previousEntryIsFresh(pub.slug, prevByPage.get(entry.pageNumber), pdfMs)) {
        const prev = prevByPage.get(entry.pageNumber)!;
        for (const w of prev.widths) await reuseExisting(derivedPagePath(pub.slug, prev.pageNumber, w));
        if (prev.hasThumbnail) await reuseExisting(derivedThumbnailPath(pub.slug, prev.pageNumber));
        pageMeta.push(prev);
      } else {
        dirtyPages.push(entry.pageNumber);
      }
    }

    if (dirtyPages.length > 0) {
      const rasterFiles = await rasterizePdf(pdfAbsPath);
      if (rasterFiles.length !== pub.pages.length) {
        console.warn(
          `[build-assets] Publication "${pub.slug}": pdftoppm produced ${rasterFiles.length} page(s), manifest expects ${pub.pages.length}.`
        );
      }
      for (const pageNumber of dirtyPages) {
        const rasterPath = rasterFiles[pageNumber - 1];
        if (!rasterPath) {
          throw new Error(
            `[build-assets] Publication "${pub.slug}": pdftoppm did not produce page ${pageNumber} (got ${rasterFiles.length} pages from content/sources/${pub.sourceRef}).`
          );
        }
        pageMeta.push(await processRasterizedPage(pub.slug, pageNumber, rasterPath));
      }

      const coverRasterPath = rasterFiles[pub.coverPage - 1];
      if (!coverRasterPath) {
        throw new Error(`[build-assets] Publication "${pub.slug}": coverPage ${pub.coverPage} out of range.`);
      }
      await processCover(pub.slug, coverRasterPath, pub.coverCrop);

      await cleanupTempDir(rasterFiles);
    } else {
      // Every page was fresh; the cover must still be checked/produced,
      // but we have no fresh raster to source it from. If it's missing we
      // need to rasterize just the cover page.
      const coverAnyMissing = await (async () => {
        for (const w of PAGE_WIDTHS) {
          if (await exists(absDerived(derivedCoverPath(pub.slug, w)))) return false;
        }
        return true;
      })();
      if (coverAnyMissing) {
        const rasterFiles = await rasterizePdf(pdfAbsPath);
        const coverRasterPath = rasterFiles[pub.coverPage - 1];
        if (coverRasterPath) {
          await processCover(pub.slug, coverRasterPath, pub.coverCrop);
        }
        await cleanupTempDir(rasterFiles);
      } else {
        for (const w of PAGE_WIDTHS) {
          const rel = derivedCoverPath(pub.slug, w);
          if (await exists(absDerived(rel))) await reuseExisting(rel);
        }
      }
    }

    pageMeta.sort((a, b) => a.pageNumber - b.pageNumber);
  }

  const sidecar: DerivedPublicationSidecar = { slug: pub.slug, pageCount: pageMeta.length, pages: pageMeta };
  await writeFile(absDerived(derivedSidecarPath(pub.slug)), JSON.stringify(sidecar, null, 2));
}

async function coverFileSize(slug: string, width: number): Promise<number | null> {
  const p = absDerived(derivedCoverPath(slug, width));
  if (!(await exists(p))) return null;
  return (await stat(p)).size;
}

/**
 * Page-level budgets (ADR 0002: BYTES_PER_HOME_PAGE, BYTES_PER_READER_PAGE)
 * — checking individual file sizes (BYTES_PER_DERIVED_IMAGE, enforced in
 * encodeWebp/main) is not the same guarantee: five individually-in-budget
 * cover images can still blow the home page's *total* budget if the page
 * has no smaller candidate to pick, which is exactly what happened before
 * this function existed (placeholder covers only ever got a 960w
 * candidate). Returns a list of human-readable problem strings; empty
 * means everything is within budget. Also verifies, for every Publication,
 * that every cover width content/publications.ts's `cover.candidates`
 * implies (i.e. every PAGE_WIDTHS entry) actually exists on disk — a
 * manifest promising a candidate the pipeline didn't produce is a build
 * bug, not a budget one, but it's cheapest to catch here since this
 * function already walks every cover file.
 */
async function verifyPageAndHomeBudgets(): Promise<string[]> {
  const problems: string[] = [];

  for (const pub of publications) {
    // Check exactly the widths the manifest actually advertises
    // (pub.cover.candidates), not every PAGE_WIDTHS entry — a Publication
    // whose cover source is narrower than 1600px (editions 2-5) correctly
    // has fewer candidates by design (see coverEffectiveWidth), so that is
    // not itself a problem; a candidate the manifest promises but the
    // pipeline didn't produce is.
    for (const candidate of pub.cover.candidates) {
      if ((await coverFileSize(pub.slug, candidate.width)) === null) {
        problems.push(
          `Publication "${pub.slug}": content/publications.ts cover.candidates promises a ${candidate.width}w cover, but ${derivedCoverPath(pub.slug, candidate.width)} does not exist.`
        );
      }
    }
  }

  // Home page: the Editions carousel shows one cover per "editions"
  // Publication. An <img srcset> picks the smallest candidate that
  // satisfies its layout, so the realistic worst case is the smallest
  // width actually available for each cover shown.
  const editionSlugs = publications.filter((p) => p.collection === "editions").map((p) => p.slug);
  let homeTotal = 0;
  const homeBreakdown: { slug: string; bytes: number }[] = [];
  for (const slug of editionSlugs) {
    let smallest: number | null = null;
    for (const w of PAGE_WIDTHS) {
      const size = await coverFileSize(slug, w);
      if (size !== null) {
        smallest = size;
        break;
      }
    }
    if (smallest === null) {
      problems.push(`Publication "${slug}": no cover candidate found at any width — cannot evaluate the home-page budget.`);
      continue;
    }
    homeTotal += smallest;
    homeBreakdown.push({ slug, bytes: smallest });
  }
  console.log("");
  console.log(
    `[build-assets] home page (editions carousel, smallest cover candidate each): ${homeTotal.toLocaleString()} bytes vs BYTES_PER_HOME_PAGE ${BYTES_PER_HOME_PAGE.toLocaleString()}`
  );
  for (const b of [...homeBreakdown].sort((a, b) => b.bytes - a.bytes)) {
    console.log(`  ${b.slug}: ${b.bytes.toLocaleString()} bytes`);
  }
  if (homeTotal > BYTES_PER_HOME_PAGE) {
    problems.push(
      `Home page budget exceeded: ${homeTotal.toLocaleString()} bytes across ${homeBreakdown.length} Edition cover(s) vs BYTES_PER_HOME_PAGE (${BYTES_PER_HOME_PAGE.toLocaleString()} bytes). Breakdown: ${homeBreakdown
        .map((b) => `${b.slug}=${b.bytes.toLocaleString()}`)
        .join(", ")}`
    );
  }

  // Reader page: the worst-case Spread is the two most expensive Pages of
  // a Publication shown side by side, both at the largest width that
  // Publication actually produced.
  for (const pub of publications) {
    if (pub.placeholder) continue;
    const sidecar = await loadPreviousSidecar(pub.slug);
    if (!sidecar || sidecar.pages.length === 0) {
      problems.push(`Publication "${pub.slug}": no derived page metadata found — cannot evaluate the reader-page budget.`);
      continue;
    }
    const maxWidth = Math.max(...sidecar.pages.flatMap((p) => p.widths));
    const sizes: number[] = [];
    for (const p of sidecar.pages) {
      if (!p.widths.includes(maxWidth)) continue;
      const fp = absDerived(derivedPagePath(pub.slug, p.pageNumber, maxWidth));
      if (await exists(fp)) sizes.push((await stat(fp)).size);
    }
    sizes.sort((a, b) => b - a);
    const worstSpread = (sizes[0] ?? 0) + (sizes[1] ?? 0);
    console.log(
      `[build-assets] ${pub.slug}: worst-case reader Spread (2 pages @ ${maxWidth}w) = ${worstSpread.toLocaleString()} bytes vs BYTES_PER_READER_PAGE ${BYTES_PER_READER_PAGE.toLocaleString()}`
    );
    if (worstSpread > BYTES_PER_READER_PAGE) {
      problems.push(
        `Reader page budget exceeded for "${pub.slug}": worst-case Spread ${worstSpread.toLocaleString()} bytes (2 pages @ ${maxWidth}w) vs BYTES_PER_READER_PAGE (${BYTES_PER_READER_PAGE.toLocaleString()} bytes).`
      );
    }
  }

  return problems;
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log(`[build-assets] ${publications.length} publication(s) in the manifest.`);
  console.log(
    `[build-assets] derived output root: "${DERIVED_ASSETS_ROOT}", widths: [${PAGE_WIDTHS.join(", ")}], thumbnail: ${THUMBNAIL_WIDTH}px.`
  );

  if (publications.length === 0) {
    console.log("[build-assets] manifest is empty — nothing to convert. Exiting 0.");
    return;
  }

  await mkdir(absDerived(DERIVED_ASSETS_ROOT), { recursive: true });

  for (const pub of publications) {
    await mkdir(absDerived(derivedPublicationDir(pub.slug)), { recursive: true });
    if (pub.placeholder) {
      console.log(`[build-assets] ${pub.slug}: placeholder cover...`);
      await processPlaceholderCover(pub);
    } else {
      console.log(`[build-assets] ${pub.slug}: ${pub.pages.length} page(s), kind=${pub.pageSourceKind}...`);
      await processReadablePublication(pub);
    }
  }

  const elapsedMs = Date.now() - startedAt;
  const totalFiles = stats.filesWritten + stats.filesReused;
  const avgBytes = totalFiles > 0 ? Math.round(stats.totalBytes / totalFiles) : 0;

  console.log("");
  console.log("[build-assets] === summary ===");
  console.log(`[build-assets] files: ${totalFiles} (${stats.filesWritten} written, ${stats.filesReused} reused from cache)`);
  console.log(`[build-assets] total derived bytes: ${stats.totalBytes.toLocaleString()} (${(stats.totalBytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`[build-assets] average file size: ${avgBytes.toLocaleString()} bytes`);
  if (stats.largest) {
    console.log(`[build-assets] largest file: ${stats.largest.path} — ${stats.largest.bytes.toLocaleString()} bytes`);
  }
  console.log(`[build-assets] elapsed: ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log(`[build-assets] budget: ${BYTES_PER_DERIVED_IMAGE.toLocaleString()} bytes/image`);

  const problems: string[] = [];
  if (stats.offenders.length > 0) {
    problems.push(
      `${stats.offenders.length} derived image(s) exceed BYTES_PER_DERIVED_IMAGE (${BYTES_PER_DERIVED_IMAGE.toLocaleString()} bytes):`
    );
    for (const o of stats.offenders.sort((a, b) => b.bytes - a.bytes)) {
      problems.push(`  ${o.path} — ${o.bytes.toLocaleString()} bytes`);
    }
  }

  // Page-level budgets (home page total, reader Spread total) — a
  // per-image pass alone can't catch these; see verifyPageAndHomeBudgets.
  problems.push(...(await verifyPageAndHomeBudgets()));

  if (problems.length > 0) {
    console.error("");
    console.error(`[build-assets] BUDGET FAILURES:`);
    for (const p of problems) console.error(`  ${p}`);
    throw new Error(`[build-assets] budget check failed — ${problems.length} problem(s). See list above.`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
