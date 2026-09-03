/**
 * DerivedImagePageSource — the one and only runtime PageSource
 * implementation (CONTEXT.md § Page Source lists "two kinds," but that is
 * a distinction in where Pages come from, not in how the reader consumes
 * them).
 *
 * DO NOT split this back into an ImagePageSource and a PdfPageSource. That
 * split would be redundant by construction: scripts/build-assets.ts (ADR
 * 0002) already rasterizes every PDF page and re-encodes every scan into
 * the *same* WebP-at-three-widths-plus-thumbnail shape, recorded in a
 * per-Publication sidecar JSON (content/derived-assets.ts
 * DerivedPublicationSidecar). By the time this class runs in the browser,
 * an image-scans Publication and a pdf Publication are indistinguishable
 * on disk — both are just a slug, a sidecar, and a folder of WebP files.
 * The image-vs-PDF split lives entirely in the build pipeline, on purpose:
 * that's the one place the two kinds actually differ. If a future change
 * needs per-kind runtime behaviour, that's a sign the build pipeline
 * stopped producing a uniform shape, not a reason to fork this class.
 */

import type {
  ImageCandidate,
  PageAsset,
  PageSource,
  PageSourceAbortError,
  PageSourceKind,
  PageSourceRequestOptions,
} from "./PageSource";
import {
  derivedPageUrl,
  derivedSidecarUrl,
  derivedThumbnailUrl,
  THUMBNAIL_WIDTH,
  type DerivedPageMetadata,
  type DerivedPublicationSidecar,
} from "../../content/derived-assets";

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError") as PageSourceAbortError;
  }
}

export interface DerivedImagePageSourceOptions {
  /** The Publication's slug — also the sidecar/derived-assets directory name. */
  slug: string;
  /** Which kind produced this Publication's derived files (diagnostics only, per PageSource.kind's contract — this class's behaviour never branches on it). */
  kind: PageSourceKind;
  /** Injectable fetch, for tests and non-browser environments. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export class DerivedImagePageSource implements PageSource {
  readonly kind: PageSourceKind;

  private readonly slug: string;
  private readonly fetchImpl: typeof fetch;
  private sidecar: DerivedPublicationSidecar | null = null;
  private pagesByNumber = new Map<number, DerivedPageMetadata>();
  private loadPromise: Promise<void> | null = null;

  constructor(options: DerivedImagePageSourceOptions) {
    this.slug = options.slug;
    this.kind = options.kind;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  get pageCount(): number {
    if (!this.sidecar) {
      throw new Error(`DerivedImagePageSource("${this.slug}"): pageCount read before load() resolved.`);
    }
    return this.sidecar.pageCount;
  }

  async load(options?: PageSourceRequestOptions): Promise<void> {
    if (this.sidecar) return;
    if (!this.loadPromise) {
      this.loadPromise = this.doLoad(options?.signal).catch((err: unknown) => {
        // Allow a retry on the next load() call if this attempt failed
        // (as opposed to being aborted mid-flight, which the caller is
        // expected to just retry anyway).
        this.loadPromise = null;
        throw err;
      });
    }
    return this.loadPromise;
  }

  private async doLoad(signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const url = derivedSidecarUrl(this.slug);
    const res = await this.fetchImpl(url, { signal });
    if (!res.ok) {
      throw new Error(
        `DerivedImagePageSource("${this.slug}"): failed to fetch sidecar metadata (${res.status} ${res.statusText}) from ${url}`
      );
    }
    const sidecar = (await res.json()) as DerivedPublicationSidecar;
    this.pagesByNumber = new Map(sidecar.pages.map((p) => [p.pageNumber, p]));
    this.sidecar = sidecar;
  }

  async getPage(pageNumber: number, options?: PageSourceRequestOptions): Promise<PageAsset> {
    return this.resolveAsset(pageNumber, "full", options);
  }

  async getThumbnail(pageNumber: number, options?: PageSourceRequestOptions): Promise<PageAsset> {
    return this.resolveAsset(pageNumber, "thumbnail", options);
  }

  // Nothing held open per-page (no decoded documents, no object URLs) —
  // every candidate is a static URL the browser's own cache manages, so
  // there is nothing productive to release as the visible Spread moves.
  // releaseOutsideRange is intentionally omitted (PageSource marks it
  // optional for exactly this case).

  dispose(): void {
    // Idempotent no-op: nothing held open (see above). Present so callers
    // can treat every PageSource uniformly without checking which kind
    // they're holding.
  }

  private resolveAsset(pageNumber: number, mode: "full" | "thumbnail", options?: PageSourceRequestOptions): Promise<PageAsset> {
    throwIfAborted(options?.signal);
    if (!this.sidecar) {
      return Promise.reject(
        new Error(`DerivedImagePageSource("${this.slug}"): getPage/getThumbnail called before load() resolved.`)
      );
    }
    const meta = this.pagesByNumber.get(pageNumber);
    if (!meta) {
      return Promise.reject(
        new Error(
          `DerivedImagePageSource("${this.slug}"): no derived metadata for page ${pageNumber} (pageCount=${this.sidecar.pageCount}).`
        )
      );
    }

    const fullCandidates: ImageCandidate[] = meta.widths.map((width) => ({
      width,
      url: derivedPageUrl(this.slug, pageNumber, width),
    }));

    const candidates: ImageCandidate[] =
      mode === "full"
        ? fullCandidates
        : meta.hasThumbnail
          ? [{ width: THUMBNAIL_WIDTH, url: derivedThumbnailUrl(this.slug, pageNumber) }]
          : fullCandidates.slice(0, 1);

    if (candidates.length === 0) {
      return Promise.reject(
        new Error(`DerivedImagePageSource("${this.slug}"): page ${pageNumber} has no derived candidates at all.`)
      );
    }

    return Promise.resolve({
      pageNumber,
      intrinsicWidth: meta.intrinsicWidth,
      intrinsicHeight: meta.intrinsicHeight,
      candidates,
    });
  }
}
