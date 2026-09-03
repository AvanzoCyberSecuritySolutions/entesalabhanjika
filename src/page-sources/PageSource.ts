/**
 * PageSource — the seam between the reader and where a Publication's Pages
 * actually come from (CONTEXT.md § Page Source).
 *
 * The reader is written once against this interface and never learns, or
 * needs to learn, whether it is holding an ImagePageSource (pre-exported
 * scan images) or a PdfPageSource (pages rendered out of a PDF with
 * pdf.js). Both implementations live in this directory and are written by
 * a later node — this file defines the contract only, no implementations.
 *
 * Design constraints baked into this interface:
 *
 * - Async throughout. A PdfPageSource cannot answer `pageCount` until the
 *   PDF document has been parsed; an ImagePageSource can usually answer
 *   immediately, but the interface does not let callers assume that.
 * - Abort-aware. The reader is a scrolling/paging UI: it requests pages
 *   speculatively (the next Spread, a thumbnail strip) and routinely
 *   discards those requests when the visitor moves on before they resolve.
 *   Every request-shaped method takes an AbortSignal so the caller can
 *   cancel work it no longer needs instead of leaving it to complete and
 *   be thrown away.
 */

/** Which family of Page Source backs a Publication (CONTEXT.md § Page Source: "Two kinds exist"). */
export type PageSourceKind = "image-scans" | "pdf";

/**
 * One resolution of a rendered Page, ready to hand to an <img> (or a
 * srcset candidate string). Derived images ship at three widths
 * (content/derived-assets.ts is the authority on exactly which); a
 * PageAsset's `candidates` list is however many the backing source could
 * offer for this page, sorted ascending by `width`.
 */
export interface ImageCandidate {
  /** Rendered pixel width of this candidate. */
  width: number;
  /** URL the reader can use directly as an <img src> or a srcset entry. */
  url: string;
}

/**
 * A renderable Page (CONTEXT.md § Page: "an image to the reader regardless
 * of how it was authored"), returned by both getPage and getThumbnail.
 * getThumbnail returns the same shape at lower resolution rather than a
 * different type, so the reader never needs a second code path to draw one.
 */
export interface PageAsset {
  /** 1-based position of this Page within its Publication. */
  pageNumber: number;
  /**
   * Intrinsic pixel dimensions of the full-resolution page. The reader
   * uses these to reserve layout space and compute Spread/Fit geometry
   * before any candidate image has actually loaded — always populated,
   * even on a thumbnail-only PageAsset.
   */
  intrinsicWidth: number;
  intrinsicHeight: number;
  /** Always at least one entry, ascending by `width`. */
  candidates: ImageCandidate[];
}

/** Threaded through every PageSource request so in-flight work can be cancelled. */
export interface PageSourceRequestOptions {
  signal?: AbortSignal;
}

/**
 * Thrown (or used to reject) when a PageSource operation is cancelled via
 * its AbortSignal. Implementations should reject with a DOMException-like
 * error whose `name` is `"AbortError"` — the same shape `fetch` produces —
 * so callers can use a single `err.name === "AbortError"` check regardless
 * of which PageSource kind they're talking to.
 */
export type PageSourceAbortError = DOMException & { name: "AbortError" };

/**
 * A Publication's Pages, addressed uniformly regardless of origin. One
 * instance is constructed per opened Publication and disposed when the
 * reader closes it.
 */
export interface PageSource {
  /** Which kind constructed this instance. Present for diagnostics/telemetry only — the reader must never branch on it. */
  readonly kind: PageSourceKind;

  /**
   * Resolve any metadata the source needs before it can answer the methods
   * below (e.g. parsing a PDF document). Must be called once and awaited
   * before `pageCount`, `getPage`, or `getThumbnail` are used. An
   * ImagePageSource may resolve this on the same microtask; callers must
   * not assume that.
   */
  load(options?: PageSourceRequestOptions): Promise<void>;

  /** Total number of Pages. Only valid after `load()` has resolved. */
  readonly pageCount: number;

  /**
   * Fetch the renderable asset for a single 1-based Page index.
   * Rejects with a PageSourceAbortError if `options.signal` fires before
   * or during resolution — expected and routine, since the reader requests
   * pages it then scrolls past; callers should catch and ignore aborts
   * rather than surface them as failures.
   */
  getPage(pageNumber: number, options?: PageSourceRequestOptions): Promise<PageAsset>;

  /**
   * Fetch a cheap, low-resolution preview for a single 1-based Page index
   * — used for scrubber/thumbnail strips and as a placeholder while a
   * full-resolution getPage() is still in flight. Same abort contract as
   * getPage().
   */
  getThumbnail(pageNumber: number, options?: PageSourceRequestOptions): Promise<PageAsset>;

  /**
   * Optional resource hint: release anything held for Pages outside
   * [firstPageNumber, lastPageNumber] (decoded PDF page objects, object
   * URLs, in-flight requests) as the reader's visible Spread moves. A
   * source with nothing to release (ImagePageSource) may omit this.
   */
  releaseOutsideRange?(firstPageNumber: number, lastPageNumber: number): void;

  /**
   * Tear down entirely: abort in-flight work, destroy any underlying
   * document object, revoke object URLs. Called once when the reader
   * unmounts or switches to a different Publication. Idempotent — safe to
   * call more than once.
   */
  dispose(): void;
}
