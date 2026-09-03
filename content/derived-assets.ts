/**
 * Derived-asset contract (ADR 0002: "A build step, and derived page images
 * generated at build time").
 *
 * This file is the single source of truth for WHERE `scripts/build-assets.ts`
 * writes derived WebP output and WHAT its filenames look like. It exists so
 * the generator (N2) and the consumer (`src/page-sources/*`, N3) can be
 * built independently and still agree byte-for-byte on paths — neither side
 * should hardcode a path or filename pattern; both import the helpers here.
 *
 * Nothing in this file touches the filesystem. It is pure path/naming logic
 * plus the documented size budgets from ADR 0002, safe to import from
 * Node (the build script) and from browser bundles (the reader) alike.
 */

/**
 * Root directory derived assets are written under, relative to the repo
 * root. Deliberately inside Vite's `public/` so the generator can write
 * plain files and have Vite copy them to `dist/` verbatim — no import
 * graph, no hashing, because these are generated post-source-checkout and
 * must exist as stable, predictable URLs the manifest can reference before
 * a build ever runs.
 *
 * Gitignored (see .gitignore) — only the authoritative sources under
 * content/sources/ are tracked in git.
 */
export const DERIVED_ASSETS_ROOT = "public/derived";

/**
 * The three responsive widths every derived page image ships at (ADR 0002).
 * Ascending order matters: consumers may rely on it for building a srcset
 * string directly from this array.
 */
export const PAGE_WIDTHS = [480, 960, 1600] as const;
export type PageWidth = (typeof PAGE_WIDTHS)[number];

/** Width of the low-res preview generated alongside each page's full-size candidates. */
export const THUMBNAIL_WIDTH = 240;

/**
 * Size budgets enforced by the build (ADR 0002). The asset pipeline must
 * fail the build rather than emit an image over BYTES_PER_DERIVED_IMAGE, or
 * a page payload over BYTES_PER_READER_PAGE.
 */
export const BYTES_PER_DERIVED_IMAGE = 300 * 1024;
export const BYTES_PER_READER_PAGE = 600 * 1024;
export const BYTES_PER_HOME_PAGE = 400 * 1024;

/** Zero-pads a 1-based page number to a fixed width so filenames sort lexicographically in page order. */
function padPageNumber(pageNumber: number): string {
  return String(pageNumber).padStart(4, "0");
}

/** Directory holding every derived asset for one Publication. */
export function derivedPublicationDir(slug: string): string {
  return `${DERIVED_ASSETS_ROOT}/${slug}`;
}

/** Directory holding one Publication's per-page derived images (full-size candidates and thumbnails alike). */
export function derivedPagesDir(slug: string): string {
  return `${derivedPublicationDir(slug)}/pages`;
}

/** Filename (no directory) of one page's derived WebP at one width, e.g. "0003-960w.webp". */
export function derivedPageFilename(pageNumber: number, width: PageWidth | number): string {
  return `${padPageNumber(pageNumber)}-${width}w.webp`;
}

/** Filename (no directory) of one page's thumbnail WebP, e.g. "0003-thumb.webp". */
export function derivedThumbnailFilename(pageNumber: number): string {
  return `${padPageNumber(pageNumber)}-thumb.webp`;
}

/** Filename (no directory) of the Publication cover at one width, e.g. "cover-960w.webp". */
export function derivedCoverFilename(width: PageWidth | number): string {
  return `cover-${width}w.webp`;
}

/**
 * Filesystem path (relative to repo root) `scripts/build-assets.ts` writes
 * a page candidate to. Consumers should not need this — it exists mainly
 * for the generator side and for tests that assert on disk layout.
 */
export function derivedPagePath(slug: string, pageNumber: number, width: PageWidth | number): string {
  return `${derivedPagesDir(slug)}/${derivedPageFilename(pageNumber, width)}`;
}

export function derivedThumbnailPath(slug: string, pageNumber: number): string {
  return `${derivedPagesDir(slug)}/${derivedThumbnailFilename(pageNumber)}`;
}

export function derivedCoverPath(slug: string, width: PageWidth | number): string {
  return `${derivedPublicationDir(slug)}/${derivedCoverFilename(width)}`;
}

/**
 * Public URL (site-root-relative, as served from `/`) for a page candidate
 * — because DERIVED_ASSETS_ROOT sits under Vite's `public/`, the on-disk
 * path with the leading "public" segment stripped IS the served URL. This
 * is the function `src/page-sources/*` implementations should actually use
 * when building an ImageCandidate.
 */
export function derivedPageUrl(slug: string, pageNumber: number, width: PageWidth | number): string {
  return `/derived/${slug}/pages/${derivedPageFilename(pageNumber, width)}`;
}

export function derivedThumbnailUrl(slug: string, pageNumber: number): string {
  return `/derived/${slug}/pages/${derivedThumbnailFilename(pageNumber)}`;
}

export function derivedCoverUrl(slug: string, width: PageWidth | number): string {
  return `/derived/${slug}/${derivedCoverFilename(width)}`;
}

/**
 * Per-Publication sidecar metadata written by `scripts/build-assets.ts`
 * once it has actually rendered/derived a Publication's pages, and read at
 * runtime by `src/page-sources/DerivedImagePageSource` instead of guessing
 * intrinsic dimensions or which widths exist on disk. One JSON file per
 * Publication, sitting alongside its derived pages.
 */
export interface DerivedPageMetadata {
  /** 1-based position within the Publication, matching PageManifestEntry.pageNumber. */
  pageNumber: number;
  /** Intrinsic pixel size of the source this page was derived from (the original scan, or the rasterized PDF page) — never upscaled past this. */
  intrinsicWidth: number;
  intrinsicHeight: number;
  /** Which of PAGE_WIDTHS were actually produced for this page, ascending, each <= intrinsicWidth. */
  widths: number[];
  /** Whether a THUMBNAIL_WIDTH thumbnail was produced for this page (always true in practice; false only if intrinsicWidth is smaller than THUMBNAIL_WIDTH). */
  hasThumbnail: boolean;
}

/** The full sidecar document for one Publication. */
export interface DerivedPublicationSidecar {
  slug: string;
  pageCount: number;
  pages: DerivedPageMetadata[];
}

/**
 * Filesystem path (relative to repo root) of a Publication's sidecar
 * metadata JSON. Generator-side (scripts/build-assets.ts) helper, paired
 * with derivedSidecarUrl() for the runtime consumer.
 */
export function derivedSidecarPath(slug: string): string {
  return `${derivedPublicationDir(slug)}/pages.json`;
}

/** Public URL (site-root-relative) for a Publication's sidecar metadata JSON — what DerivedImagePageSource fetches. */
export function derivedSidecarUrl(slug: string): string {
  return `/derived/${slug}/pages.json`;
}
