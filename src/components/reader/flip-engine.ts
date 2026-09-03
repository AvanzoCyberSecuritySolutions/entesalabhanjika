/**
 * The only module that imports "page-flip". Everything downstream of here
 * (reader.ts and everything it composes) talks to FlipEngine's own small,
 * 1-based-page-number vocabulary — StPageFlip's 0-based indices, its
 * FlipCorner/FlippingState string unions, and its settings-object-mutation
 * update path never leak past this file (ADR 0001: "Wrap it — do not let
 * its API leak into the rest of the app").
 */

import { PageFlip } from "page-flip";
import type { ContainerSize, PageAspectRatio } from "./layout";
import { computeStretchBounds } from "./layout";

export interface FlipEngineOptions {
  /** Element StPageFlip mounts into. Must already be attached and sized — the first layout is computed from its current box, there is no deferred "wait for size" step. */
  container: HTMLElement;
  containerSize: ContainerSize;
  pageAspectRatio: PageAspectRatio;
  /** Every Page element (already built by page-loader.ts), in order, `data-density="hard"` set on the ones that should behave as stiff board. */
  pageElements: HTMLElement[];
  /** 1-based. Clamped to [1, pageElements.length]. */
  startPage: number;
  /** prefers-reduced-motion (requirement 9): when true, every turn is instant (StPageFlip's turnToPage family) and its own corner-hover-fold / drag-to-peel handling is disabled outright — "disable the curl entirely" can only mean StPageFlip never gets to draw a curl, not just "animate it faster". Tap-zone and button turning keep working; see zoom-pan.ts's docstring for why those don't depend on StPageFlip's own touch handling anyway. */
  reducedMotion: boolean;
  /** 1-based page number, fired after every completed turn (StPageFlip's "flip" event). */
  onPageChange: (pageNumber: number) => void;
}

export class FlipEngine {
  private readonly pageFlip: PageFlip;
  private readonly reducedMotion: boolean;

  constructor(options: FlipEngineOptions) {
    this.reducedMotion = options.reducedMotion;
    const bounds = computeStretchBounds(options.containerSize, options.pageAspectRatio);

    this.pageFlip = new PageFlip(options.container, {
      size: "stretch",
      // Only the RATIO of these two matters (Settings.ts only ever reads
      // `width / height`) — validation just requires both positive.
      width: options.pageAspectRatio * 1000,
      height: 1000,
      minWidth: bounds.minWidth,
      maxWidth: bounds.maxWidth,
      minHeight: 100,
      maxHeight: 3000,
      showCover: true, // first/last page render as hard covers (requirement 8) — combined with the explicit data-density="hard" page-loader.ts sets on them
      usePortrait: true, // required for the container-aspect-ratio Spread/single rule (layout.ts) to have any effect at all
      drawShadow: true,
      maxShadowOpacity: 0.5,
      mobileScrollSupport: false, // the reader owns its own viewport; it isn't embedded in a taller scrolling page
      showPageCorners: !options.reducedMotion,
      useMouseEvents: !options.reducedMotion,
      flippingTime: options.reducedMotion ? 1 : 700,
      startPage: clamp(options.startPage, 1, options.pageElements.length) - 1,
    });

    this.pageFlip.on("flip", (e) => {
      if (typeof e.data === "number") options.onPageChange(e.data + 1);
    });

    this.pageFlip.loadFromHTML(options.pageElements);
  }

  get pageCount(): number {
    return this.pageFlip.getPageCount();
  }

  get currentPageNumber(): number {
    return this.pageFlip.getCurrentPageIndex() + 1;
  }

  /** True when two Pages (a Spread, CONTEXT.md § Spread) are currently shown side by side. */
  get isSpread(): boolean {
    return this.pageFlip.getOrientation() === "landscape";
  }

  next(): void {
    this.reducedMotion ? this.pageFlip.turnToNextPage() : this.pageFlip.flipNext();
  }

  prev(): void {
    this.reducedMotion ? this.pageFlip.turnToPrevPage() : this.pageFlip.flipPrev();
  }

  goTo(pageNumber: number): void {
    const index = clamp(pageNumber, 1, this.pageCount) - 1;
    this.reducedMotion ? this.pageFlip.turnToPage(index) : this.pageFlip.flip(index);
  }

  /** Requirement 2: recompute the Spread/single boundary against the *current* container size. Call on every debounced resize/orientation-change tick. */
  updateLayout(containerSize: ContainerSize, pageAspectRatio: PageAspectRatio): void {
    const bounds = computeStretchBounds(containerSize, pageAspectRatio);
    const settings = this.pageFlip.getSettings(); // returned by reference — see vendor/page-flip.d.ts
    settings.minWidth = bounds.minWidth;
    settings.maxWidth = bounds.maxWidth;
    this.pageFlip.update();
  }

  /** The book's current on-screen box at zoom 1 (Fit) — zoom-pan.ts clamps panning against this. */
  getBoundsSize(): { width: number; height: number } {
    const rect = this.pageFlip.getBoundsRect();
    return { width: rect.width, height: rect.height };
  }

  destroy(): void {
    this.pageFlip.destroy();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
