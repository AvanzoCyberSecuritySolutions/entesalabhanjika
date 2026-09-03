/**
 * The Publication manifest — single source of truth for every Edition and
 * Book on the site (CONTEXT.md).
 *
 * Both `vite.config.ts` (to derive its MPA rollup entries) and
 * `scripts/build-assets.ts` (to know which sources to convert) import this
 * array, so this file is what wires a new Publication into the build and
 * the site without editing either of those files by hand.
 *
 * Source files referenced below (`sourceRef`, `pages[].sourceFile`) resolve
 * under content/sources/ per the conventions documented on
 * ReadablePublication and PageManifestEntry in ./publication.ts:
 *   - image-scans: content/sources/<sourceRef>/<sourceFile>
 *   - pdf:         content/sources/<sourceRef>
 *
 * Every Publication's `cover` is built the same way regardless of kind —
 * coverForSlug() below, wrapping content/derived-assets.ts
 * derivedCoverCandidates(). Placeholder Publications (editions 2-5) have no
 * PageManifestEntry list — there is nothing to read yet — but each still
 * has an archival cover source at content/sources/placeholders/<slug>-
 * cover.jpg, which scripts/build-assets.ts derives at every PAGE_WIDTHS
 * entry that fits under its measured width (see that script for the
 * naming convention). Editions 2-5's cover art happens to be narrower
 * than the widest PAGE_WIDTHS entry, so their `cover` has fewer candidates
 * than a readable Publication's — see coverForSlug()'s effectiveWidth.
 */

import type { Publication, PublicationCover } from "./publication";
import { derivedCoverCandidates } from "./derived-assets";

/**
 * `effectiveWidth` is the measured pixel width of the actual cover source
 * image (post-crop, where a coverCrop applies) — see
 * PublicationCommon.coverEffectiveWidth for why this can't be computed
 * here and has to be a recorded fact instead. Measured via `sharp(...).
 * metadata()` against each Publication's real source/derived page:
 *   edition-1                2367  (content/sources/edition-1/page-0001.jpg)
 *   edition-2..5              1414  (content/sources/placeholders/*-cover.jpg)
 *   natyasasthram, make-up-text-book  2584  (PDF page 1 rasterized @ 150dpi)
 *   thalam                    1602  (2584 * coverCrop.widthRatio 0.62, rounded)
 */
function coverForSlug(slug: string, effectiveWidth: number): PublicationCover {
  return { candidates: derivedCoverCandidates(slug, effectiveWidth) };
}

/** 1-based page numbers [1, count], for image-scans Publications whose sourceFile is named by the same zero-padded position (see content/sources/edition-1/). */
function sequentialImagePages(count: number): { pageNumber: number; sourceFile: string }[] {
  return Array.from({ length: count }, (_, i) => {
    const pageNumber = i + 1;
    return { pageNumber, sourceFile: `page-${String(pageNumber).padStart(4, "0")}.jpg` };
  });
}

/** 1-based page numbers [1, count], for pdf Publications — sourceFile is omitted, the PDF's own page order addresses each entry. */
function sequentialPdfPages(count: number): { pageNumber: number }[] {
  return Array.from({ length: count }, (_, i) => ({ pageNumber: i + 1 }));
}

export const publications: Publication[] = [
  {
    slug: "edition-1",
    title: "Edition 1",
    kind: "edition",
    collection: "editions",
    issueNumber: 1,
    cover: coverForSlug("edition-1", 2367),
    coverEffectiveWidth: 2367,
    placeholder: false,
    pageSourceKind: "image-scans",
    sourceRef: "edition-1",
    // 35 scans, images-0..images-34 each exactly once, cover = images-0
    // (page 1). The legacy edition1.html listed images-6 twice (36 <img>
    // tags for 35 files), shifting every spread after page 7 — verified by
    // counting content/sources/edition-1/ (35 files) against the old HTML
    // before writing this list; not reproduced here.
    pages: sequentialImagePages(35),
    coverPage: 1,
  },
  {
    slug: "edition-2",
    title: "Edition 2",
    kind: "edition",
    collection: "editions",
    issueNumber: 2,
    cover: coverForSlug("edition-2", 1414),
    coverEffectiveWidth: 1414,
    placeholder: true,
  },
  {
    slug: "edition-3",
    title: "Edition 3",
    kind: "edition",
    collection: "editions",
    issueNumber: 3,
    cover: coverForSlug("edition-3", 1414),
    coverEffectiveWidth: 1414,
    placeholder: true,
  },
  {
    slug: "edition-4",
    title: "Edition 4",
    kind: "edition",
    collection: "editions",
    issueNumber: 4,
    cover: coverForSlug("edition-4", 1414),
    coverEffectiveWidth: 1414,
    placeholder: true,
  },
  {
    slug: "edition-5",
    title: "Edition 5",
    kind: "edition",
    collection: "editions",
    issueNumber: 5,
    cover: coverForSlug("edition-5", 1414),
    coverEffectiveWidth: 1414,
    placeholder: true,
  },
  {
    slug: "natyasasthram",
    title: "Natyasasthram",
    kind: "book",
    collection: "in-house-books",
    cover: coverForSlug("natyasasthram", 2584),
    coverEffectiveWidth: 2584,
    placeholder: false,
    pageSourceKind: "pdf",
    sourceRef: "natyasasthram.pdf",
    pages: sequentialPdfPages(41),
    coverPage: 1,
  },
  {
    slug: "thalam",
    title: "Thalam",
    kind: "book",
    collection: "in-house-books",
    cover: coverForSlug("thalam", 1602),
    coverEffectiveWidth: 1602,
    placeholder: false,
    pageSourceKind: "pdf",
    sourceRef: "thalam.pdf",
    pages: sequentialPdfPages(20),
    coverPage: 1,
    // Old in-house.html cropped this cover's whitespace with a
    // { widthRatio: 0.62, heightRatio: 0.82 } canvas trick, hardcoded into
    // the render call. Same numbers, now manifest metadata instead.
    coverCrop: { widthRatio: 0.62, heightRatio: 0.82 },
  },
  {
    slug: "make-up-text-book",
    title: "Make-up Text Book",
    kind: "book",
    collection: "in-house-books",
    cover: coverForSlug("make-up-text-book", 2584),
    coverEffectiveWidth: 2584,
    placeholder: false,
    pageSourceKind: "pdf",
    sourceRef: "make-up-text-book.pdf",
    pages: sequentialPdfPages(59),
    coverPage: 1,
  },
];
