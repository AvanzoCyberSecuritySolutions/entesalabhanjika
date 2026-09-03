/**
 * Bridges a PageSource (src/page-sources/PageSource.ts — owned by another
 * node, read here only as a contract) to the actual DOM StPageFlip renders.
 *
 * StPageFlip's HTML mode wants every Page element up front (there is no
 * "add a page later" API, only replace-the-whole-collection), but a
 * PageSource's getPage() is async and a 155-page Publication must not fire
 * 155 requests on mount. The split: `buildPlaceholders` makes cheap empty
 * <div>/<img> elements for every Page synchronously (just DOM, no
 * network — satisfies StPageFlip's up-front requirement), and
 * `ensureLoaded` is called by reader.ts with whatever page numbers are
 * currently visible-or-adjacent and only fetches those, cancelling
 * requests for pages that fall out of range before they resolve (the exact
 * "requests speculatively, routinely discards them" pattern PageSource's
 * own docstring describes).
 */

import type { PageAsset, PageSource } from "../../page-sources/PageSource";

const PAGE_ITEM_CLASS = "reader-page";
const PAGE_IMG_CLASS = "reader-page-img";

/**
 * Synchronous, network-free: builds one placeholder element per Page,
 * marking the first and last `data-density="hard"` (requirement 8's hard
 * covers — StPageFlip reads this attribute once, at construction, to
 * decide page stiffness, so it must be present before FlipEngine ever
 * calls loadFromHTML). The caller (reader.ts) is responsible for knowing
 * the Publication's page aspect ratio up front — this function is pure
 * DOM construction and doesn't touch the PageSource itself.
 */
export function buildPlaceholders(pageCount: number): HTMLElement[] {
  const elements: HTMLElement[] = [];
  for (let i = 0; i < pageCount; i++) {
    const pageNumber = i + 1;
    const el = document.createElement("div");
    el.className = PAGE_ITEM_CLASS;
    el.dataset.density = pageNumber === 1 || pageNumber === pageCount ? "hard" : "soft";
    el.dataset.pageNumber = String(pageNumber);

    const inner = document.createElement("div");
    inner.className = "reader-page-inner";

    const img = document.createElement("img");
    img.className = PAGE_IMG_CLASS;
    img.alt = `Page ${pageNumber}`;
    // Deliberately NOT loading="lazy". StPageFlip sets display:none on every
    // Page that is not currently shown, and a lazy image inside a display:none
    // subtree is never fetched — it can never enter the viewport. That
    // deadlocks: the engine hides Pages until it needs them, the Pages refuse
    // to load until shown, so only the Page visible at first paint ever loads
    // and the engine is left without the geometry it needs to turn.
    // Laziness here is the prefetch window in loadRange() instead: a Page with
    // no src costs nothing, and applyAsset() only sets one when it is wanted.
    img.decoding = "async";
    inner.appendChild(img);

    const texture = document.createElement("div");
    texture.className = "reader-page-texture";
    texture.setAttribute("aria-hidden", "true");

    const spine = document.createElement("div");
    spine.className = "reader-page-spine-shade";
    spine.setAttribute("aria-hidden", "true");

    el.append(inner, texture, spine);
    elements.push(el);
  }

  return elements;
}

function applyAsset(imgEl: HTMLImageElement, asset: PageAsset): void {
  const largest = asset.candidates[asset.candidates.length - 1];
  if (!largest) return; // PageSource contract guarantees at least one candidate; guarded defensively rather than assumed
  imgEl.src = largest.url;
  imgEl.srcset = asset.candidates.map((c) => `${c.url} ${c.width}w`).join(", ");
  imgEl.sizes = "(max-width: 700px) 100vw, 50vw";
  imgEl.width = asset.intrinsicWidth;
  imgEl.height = asset.intrinsicHeight;
}

export class PageLoader {
  private readonly pageSource: PageSource;
  private readonly elements: HTMLElement[];
  private readonly loaded = new Set<number>();
  private readonly inFlight = new Map<number, AbortController>();

  constructor(pageSource: PageSource, elements: HTMLElement[]) {
    this.pageSource = pageSource;
    this.elements = elements;
  }

  /**
   * Fetch full-resolution assets for exactly this set of 1-based page
   * numbers (reader.ts passes the visible Spread/Page plus a small
   * prefetch margin). Already-loaded pages are skipped; in-flight
   * requests for pages no longer in `pageNumbers` are aborted.
   */
  ensureLoaded(pageNumbers: readonly number[]): void {
    const wanted = new Set(pageNumbers);

    for (const [pageNumber, controller] of this.inFlight) {
      if (!wanted.has(pageNumber)) {
        controller.abort();
        this.inFlight.delete(pageNumber);
      }
    }

    for (const pageNumber of wanted) {
      if (this.loaded.has(pageNumber) || this.inFlight.has(pageNumber)) continue;
      const el = this.elements[pageNumber - 1];
      if (!el) continue;
      const img = el.querySelector<HTMLImageElement>(`.${PAGE_IMG_CLASS}`);
      if (!img) continue;

      const controller = new AbortController();
      this.inFlight.set(pageNumber, controller);

      this.pageSource
        .getPage(pageNumber, { signal: controller.signal })
        .then((asset) => {
          if (controller.signal.aborted) return;
          applyAsset(img, asset);
          this.loaded.add(pageNumber);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return; // routine, per PageSource's own contract
          console.error(`[reader] failed to load page ${pageNumber}`, err);
        })
        .finally(() => {
          this.inFlight.delete(pageNumber);
        });
    }
  }

  /** Passthrough to PageSource's optional resource hint (releaseOutsideRange) — a no-op source (ImagePageSource) simply won't implement it. */
  releaseOutsideRange(firstPageNumber: number, lastPageNumber: number): void {
    this.pageSource.releaseOutsideRange?.(firstPageNumber, lastPageNumber);
  }

  dispose(): void {
    for (const controller of this.inFlight.values()) controller.abort();
    this.inFlight.clear();
  }
}
