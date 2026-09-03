/**
 * The Publication type — CONTEXT.md's core entity, defined once here and
 * imported everywhere else (the manifest, vite.config.ts, the asset
 * pipeline, the reader). "Both Editions and Books are Publications; they
 * differ only in metadata and which Collection they sit in — never in how
 * they are read."
 */

import type { ImageCandidate, PageSourceKind } from "../src/page-sources/PageSource";

/**
 * A curated shelf of Publications (CONTEXT.md § Collection). Two exist
 * today: the home carousel of Editions, and the In-house Books grid. A
 * Collection is a presentation grouping, not a different kind of content —
 * this type carries no fields Publications don't already have; it exists
 * so `collection` on Publication is a checked union instead of a free
 * string.
 */
export type CollectionSlug = "editions" | "in-house-books";

export interface Collection {
  slug: CollectionSlug;
  /** Shown as the shelf heading, e.g. "Editions", "In-house Books". */
  title: string;
}

/** Curated shelves that exist today (CONTEXT.md § Collection: "Two exist"). */
export const COLLECTIONS: readonly Collection[] = [
  { slug: "editions", title: "Editions" },
  { slug: "in-house-books", title: "In-house Books" },
];

/** Whether a Publication is a numbered periodical issue or a standalone title (CONTEXT.md § Edition, § Book). */
export type PublicationKind = "edition" | "book";

/**
 * One entry in a Publication's ordered page list. For an image-scans
 * Publication `sourceFile` names the specific scan under
 * content/sources/<slug>/ that fills this position — source scans are not
 * reliably numbered on disk (see content/sources/README expectations), so
 * the manifest is what fixes reading order. For a pdf Publication the
 * source file already has an intrinsic page order, so `sourceFile` is
 * omitted and `pageNumber` alone addresses the page within that PDF.
 */
export interface PageManifestEntry {
  /** 1-based position within the Publication. */
  pageNumber: number;
  /** Image-scans Publications only: filename under content/sources/<slug>/. */
  sourceFile?: string;
}

/**
 * A Publication's cover art, ready for a card renderer to build a real
 * `srcset` from and let the browser pick. Deliberately shaped like
 * PageAsset.candidates (src/page-sources/PageSource.ts) — a cover is just
 * an image with several resolutions, same as a Page, so the two should
 * share a rendering primitive instead of each inventing their own. Lives
 * on PublicationCommon (not on ReadablePublication or PlaceholderPublication
 * individually) so a shelf/carousel component never has to branch on
 * `placeholder` just to show a cover.
 *
 * No intrinsicWidth/intrinsicHeight here (unlike PageAsset): those would
 * have to come from actually measuring the source image, which is a
 * build-time fact this static, hand-authored manifest has no honest way to
 * carry — `cover.candidates` is built from PAGE_WIDTHS alone (see
 * content/derived-assets.ts derivedCoverCandidates), not from measurement.
 * scripts/build-assets.ts is responsible for actually producing a file at
 * every width this implies, for every Publication, and fails the build if
 * one is missing (see its verifyBudgets pass).
 */
export interface PublicationCover {
  /** Ascending by width; always at least one entry. */
  candidates: ImageCandidate[];
}

interface PublicationCommon {
  /** URL-safe unique id, e.g. "edition-1", "natyasasthram". Used as the routing key, and as the folder name under both content/sources/ and the derived-assets contract (content/derived-assets.ts). */
  slug: string;
  title: string;
  kind: PublicationKind;
  collection: CollectionSlug;
  /** Edition-only: issue number (CONTEXT.md § Edition). Required when kind === "edition". */
  issueNumber?: number;
  /** Book-only: subject or author line shown under the title (CONTEXT.md § Book). Required when kind === "book". */
  subject?: string;
  /** This Publication's cover art. See PublicationCover for why this is uniform across readable and placeholder Publications. */
  cover: PublicationCover;
  /**
   * Measured pixel width of the actual image scripts/build-assets.ts
   * encodes this Publication's cover from — the width AFTER cropping, for
   * a Publication with coverCrop, since that's what the pipeline really
   * resizes down from. content/publications.ts uses this (via
   * content/derived-assets.ts derivedCoverCandidates) to compute `cover`
   * without upscaling past what the source can actually support — e.g.
   * editions 2-5's placeholder cover art is a 1414px-wide scan, narrower
   * than PAGE_WIDTHS' 1600 entry, so their cover has only two candidates,
   * not three. A hand-recorded fact (like `pages`' page counts elsewhere
   * in this file), not something computed at manifest-authoring time —
   * kept honest by scripts/build-assets.ts failing the build if a
   * candidate this implies doesn't exist on disk.
   */
  coverEffectiveWidth: number;
}

/**
 * A fractional crop applied to a Publication's cover thumbnail only — the
 * full Page is still what the reader opens; this only affects the cover
 * art shown on shelves. Added for Thalam, whose source PDF's first page
 * has dead whitespace around the actual cover art. Fractions are measured
 * from the top-left corner of the full rendered cover, matching the old
 * in-house.html canvas-crop behaviour it replaces (which despite its "crop
 * the right/bottom" comment, kept the top-left widthRatio x heightRatio
 * region — verified by reading the render code, not just the comment).
 */
export interface CoverCrop {
  /** Fraction (0, 1] of the full cover width to keep, from the left edge. */
  widthRatio: number;
  /** Fraction (0, 1] of the full cover height to keep, from the top edge. */
  heightRatio: number;
}

/**
 * A Publication whose Pages exist and can be opened in the reader.
 */
export interface ReadablePublication extends PublicationCommon {
  placeholder: false;
  /** Which PageSource implementation reads this Publication's Pages. */
  pageSourceKind: PageSourceKind;
  /** Filename (pdf) or source subfolder name (image-scans) under content/sources/. */
  sourceRef: string;
  /** Ordered Pages. Never empty for a ReadablePublication. */
  pages: PageManifestEntry[];
  /** 1-based page used to derive the cover thumbnail (content/derived-assets.ts derivedCoverUrl). */
  coverPage: number;
  /**
   * Optional crop applied when rendering this Publication's cover
   * thumbnail (not its reader Pages). Absent means use the full cover
   * page uncropped. See CoverCrop for why this exists as manifest data
   * instead of a hardcoded render-call argument.
   */
  coverCrop?: CoverCrop;
}

/**
 * A Publication announced in a Collection but not yet readable (CONTEXT.md
 * § Placeholder Publication) — editions 2-5 today. Modelled as a distinct
 * variant rather than a `readable: true` Publication with empty `pages` so
 * that code which only makes sense for readable Publications (constructing
 * a PageSource, computing pageCount) cannot even be attempted against one:
 * the fields it would need do not exist on this type.
 */
export interface PlaceholderPublication extends PublicationCommon {
  placeholder: true;
}

export type Publication = ReadablePublication | PlaceholderPublication;
