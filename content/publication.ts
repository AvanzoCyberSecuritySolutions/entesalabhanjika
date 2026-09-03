/**
 * The Publication type — CONTEXT.md's core entity, defined once here and
 * imported everywhere else (the manifest, vite.config.ts, the asset
 * pipeline, the reader). "Both Editions and Books are Publications; they
 * differ only in metadata and which Collection they sit in — never in how
 * they are read."
 */

import type { PageSourceKind } from "../src/page-sources/PageSource";

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
  /** Static "coming soon" artwork, site-root-relative — there is no scan/PDF source yet to derive a cover from. */
  coverImage: string;
}

export type Publication = ReadablePublication | PlaceholderPublication;
