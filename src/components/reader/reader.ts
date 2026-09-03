/**
 * Reader — the public entry point for this whole directory. Composes every
 * other module in src/components/reader/ against an injected PageSource
 * (never constructs one itself — CONTEXT.md § Page Source, and the task
 * brief's "Never construct a PageSource yourself") and never lets
 * StPageFlip's own types or DOM structure leak past flip-engine.ts.
 *
 * Usage:
 *   const reader = new Reader({ container, pageSource, publicationSlug, publicationTitle });
 *   await reader.mount();
 *   // ...
 *   reader.destroy();
 */

import type { PageSource } from "../page-sources/PageSource";
import { FlipEngine } from "./flip-engine";
import { buildPlaceholders, PageLoader } from "./page-loader";
import { ZoomPanController, type TapZone } from "./zoom-pan";
import { ThumbnailStrip } from "./thumbnails";
import { SoundController } from "./sound";
import { getResumePage, setResumePage } from "./progress";

export interface ReaderOptions {
  /** Reader takes ownership of this element's contents; nothing else should render into it. */
  container: HTMLElement;
  pageSource: PageSource;
  /** CONTEXT.md § Publication — used to namespace the resume position (progress.ts). */
  publicationSlug: string;
  /** Used for the viewport's accessible name. */
  publicationTitle: string;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/** How many Pages beyond the visible Spread/Page to keep loaded, in each direction — small enough to stay "lazy", large enough that a deliberate turn never shows a blank page while its request is in flight. */
const PREFETCH_MARGIN = 2;

export class Reader {
  private readonly opts: ReaderOptions;
  private readonly root: HTMLElement;
  private readonly reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  private readonly sound = new SoundController();

  private engine: FlipEngine | null = null;
  private zoomPan: ZoomPanController | null = null;
  private pageLoader: PageLoader | null = null;
  private thumbnails: ThumbnailStrip | null = null;
  private pageElements: HTMLElement[] = [];
  private pageAspectRatio = 1;
  private resizeObserver: ResizeObserver | null = null;
  private resizeTimer: number | undefined;
  private mounted = false;

  // Filled in by buildDom(); every field is guaranteed set once mount() resolves.
  private viewportEl!: HTMLElement;
  private surfaceEl!: HTMLElement;
  private flipRootEl!: HTMLElement;
  private stackLeftEl!: HTMLElement;
  private stackRightEl!: HTMLElement;
  private indicatorEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private jumpInputEl!: HTMLInputElement;
  private thumbsToggleEl!: HTMLButtonElement;

  constructor(options: ReaderOptions) {
    this.opts = options;
    this.root = document.createElement("div");
    this.root.className = "reader";
  }

  async mount(): Promise<void> {
    await this.opts.pageSource.load();
    const pageCount = this.opts.pageSource.pageCount;

    if (pageCount <= 0) {
      this.renderEmptyState();
      return;
    }

    const cover = await this.opts.pageSource.getThumbnail(1);
    this.pageAspectRatio = cover.intrinsicWidth / cover.intrinsicHeight;

    this.buildDom(pageCount);
    this.opts.container.replaceChildren(this.root);

    this.pageElements = buildPlaceholders(pageCount);
    this.pageLoader = new PageLoader(this.opts.pageSource, this.pageElements);

    const resumePage = getResumePage(this.opts.publicationSlug);
    const startPage = resumePage !== null ? clamp(resumePage, 1, pageCount) : 1;

    this.mountFlipEngine(startPage);

    this.zoomPan = new ZoomPanController({
      viewport: this.viewportEl,
      surface: this.surfaceEl,
      getContentSize: () => this.engine?.getBoundsSize() ?? { width: 0, height: 0 },
      onTapZone: (zone: TapZone) => this.turn(zone === "left" ? "prev" : "next"),
      onZoomChange: (_zoom, atFit) => this.viewportEl.classList.toggle("is-zoomed", !atFit),
    });
    this.zoomPan.setReducedMotion(this.reducedMotionQuery.matches);
    this.zoomPan.attach();

    this.thumbnails = new ThumbnailStrip({
      pageSource: this.opts.pageSource,
      pageCount,
      onSelect: (pageNumber) => {
        this.thumbnails?.toggle(false);
        this.goToPage(pageNumber);
      },
    });
    this.root.appendChild(this.thumbnails.element);

    this.wireControls();
    this.observeResize();
    this.reducedMotionQuery.addEventListener("change", this.handleMotionPreferenceChange);
    window.addEventListener("orientationchange", this.handleOrientationChange);
    window.addEventListener("keydown", this.handleKeydown);

    this.sound.unlockOnFirstGesture(this.root);
    this.applyFirstLoadCornerHint();

    this.updatePageChrome(startPage, pageCount);
    this.mounted = true;
  }

  destroy(): void {
    if (!this.mounted) return;
    this.mounted = false;

    this.reducedMotionQuery.removeEventListener("change", this.handleMotionPreferenceChange);
    window.removeEventListener("orientationchange", this.handleOrientationChange);
    window.removeEventListener("keydown", this.handleKeydown);
    if (this.resizeTimer !== undefined) window.clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();

    this.zoomPan?.detach();
    this.thumbnails?.dispose();
    this.pageLoader?.dispose();
    this.engine?.destroy();
    this.opts.pageSource.dispose();

    this.root.remove();
  }

  // ---- DOM construction ----------------------------------------------

  private buildDom(pageCount: number): void {
    const jumpInputId = nextId("reader-jump-input");

    this.root.innerHTML = `
      <div class="reader-topbar">
        <div class="reader-indicator" aria-hidden="true"></div>
        <form class="reader-jump" aria-label="Jump to page">
          <label class="reader-jump-label" for="${jumpInputId}">Go to page</label>
          <input class="reader-jump-input" id="${jumpInputId}" type="number" min="1" max="${pageCount}" step="1" inputmode="numeric" />
          <button class="reader-jump-submit" type="submit">Go</button>
        </form>
        <div class="reader-topbar-actions"></div>
      </div>
      <div class="reader-stage">
        <button class="reader-nav reader-nav--prev" type="button" aria-label="Previous page">
          <span aria-hidden="true">&#8249;</span>
        </button>
        <div class="reader-viewport" role="region" aria-roledescription="book" aria-label="${escapeHtml(this.opts.publicationTitle)} — page reader">
          <div class="reader-page-stack reader-page-stack--left" aria-hidden="true"></div>
          <div class="reader-surface">
            <div class="reader-flip-root"></div>
          </div>
          <div class="reader-page-stack reader-page-stack--right" aria-hidden="true"></div>
        </div>
        <button class="reader-nav reader-nav--next" type="button" aria-label="Next page">
          <span aria-hidden="true">&#8250;</span>
        </button>
      </div>
      <p class="reader-status sr-only" aria-live="polite"></p>
    `;

    this.viewportEl = this.query(".reader-viewport");
    this.surfaceEl = this.query(".reader-surface");
    this.flipRootEl = this.query(".reader-flip-root");
    this.stackLeftEl = this.query(".reader-page-stack--left");
    this.stackRightEl = this.query(".reader-page-stack--right");
    this.indicatorEl = this.query(".reader-indicator");
    this.statusEl = this.query(".reader-status");
    this.jumpInputEl = this.query<HTMLInputElement>(".reader-jump-input");
  }

  private query<T extends HTMLElement = HTMLElement>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`[reader] expected "${selector}" in the mounted DOM`);
    return el;
  }

  private renderEmptyState(): void {
    this.root.textContent = "This book has no pages yet.";
    this.root.classList.add("reader-empty");
    this.opts.container.replaceChildren(this.root);
  }

  /** flip-engine.ts's destroy() removes its own root element (StPageFlip's `PageFlip.destroy()` calls `this.block.remove()`) — every (re)construction needs a fresh mount point rather than reusing one that may already have been torn down. */
  private mountFlipEngine(startPage: number): void {
    this.flipRootEl = document.createElement("div");
    this.flipRootEl.className = "reader-flip-root";
    this.surfaceEl.replaceChildren(this.flipRootEl);

    this.engine = new FlipEngine({
      container: this.flipRootEl,
      containerSize: { width: this.viewportEl.clientWidth, height: this.viewportEl.clientHeight },
      pageAspectRatio: this.pageAspectRatio,
      pageElements: this.pageElements,
      startPage,
      reducedMotion: this.reducedMotionQuery.matches,
      onPageChange: (pageNumber) => this.handlePageChange(pageNumber),
    });
  }

  // ---- controls --------------------------------------------------------

  private wireControls(): void {
    this.query(".reader-nav--prev").addEventListener("click", () => this.turn("prev"));
    this.query(".reader-nav--next").addEventListener("click", () => this.turn("next"));

    const jumpForm = this.query<HTMLFormElement>(".reader-jump");
    jumpForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const value = Number(this.jumpInputEl.value);
      if (!Number.isFinite(value)) return;
      this.goToPage(Math.round(value));
      this.jumpInputEl.value = "";
      this.jumpInputEl.blur();
    });

    const actions = this.query(".reader-topbar-actions");
    actions.appendChild(this.sound.toggleButton);

    this.thumbsToggleEl = document.createElement("button");
    this.thumbsToggleEl.type = "button";
    this.thumbsToggleEl.className = "reader-thumbs-toggle";
    this.thumbsToggleEl.setAttribute("aria-expanded", "false");
    this.thumbsToggleEl.textContent = "Pages";
    this.thumbsToggleEl.addEventListener("click", () => {
      const next = !(this.thumbnails?.isOpen ?? false);
      this.thumbnails?.toggle(next);
      this.thumbsToggleEl.setAttribute("aria-expanded", String(next));
      if (next) this.thumbnails?.setCurrentPage(this.engine?.currentPageNumber ?? 1);
    });
    actions.appendChild(this.thumbsToggleEl);
  }

  private readonly handleKeydown = (e: KeyboardEvent): void => {
    const active = document.activeElement;
    const isTyping = active instanceof HTMLElement && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
    if (isTyping) return;

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      this.turn("prev");
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      this.turn("next");
    } else if (e.key === "Escape" && this.thumbnails?.isOpen) {
      this.thumbnails.toggle(false);
      this.thumbsToggleEl.setAttribute("aria-expanded", "false");
    }
  };

  private turn(direction: "prev" | "next"): void {
    if (!this.engine) return;
    this.zoomPan?.reset(); // requirement 3: turning always snaps back to Fit
    direction === "next" ? this.engine.next() : this.engine.prev();
  }

  private goToPage(pageNumber: number): void {
    if (!this.engine) return;
    this.zoomPan?.reset();
    this.engine.goTo(pageNumber);
  }

  // ---- page-change side effects -----------------------------------------

  private handlePageChange(pageNumber: number): void {
    if (!this.engine) return;
    setResumePage(this.opts.publicationSlug, pageNumber);
    this.sound.playTurn();
    this.updatePageChrome(pageNumber, this.engine.pageCount);
  }

  private updatePageChrome(pageNumber: number, pageCount: number): void {
    this.indicatorEl.textContent = `Page ${pageNumber} of ${pageCount}`;
    this.statusEl.textContent = `Page ${pageNumber} of ${pageCount}`;
    this.jumpInputEl.placeholder = String(pageNumber);
    this.thumbnails?.setCurrentPage(pageNumber);

    // Page-stack thickness (requirement 8): the closed-edge stack on the
    // left visibly thickens with pages already read, the right thins with
    // pages remaining — driven by a single 0..1 CSS custom property per
    // side so reader.css owns the actual gradient rendering.
    const read = pageCount > 1 ? (pageNumber - 1) / (pageCount - 1) : 0;
    this.stackLeftEl.style.setProperty("--reader-stack-fraction", String(read));
    this.stackRightEl.style.setProperty("--reader-stack-fraction", String(1 - read));

    const margin = (this.engine?.isSpread ?? false) ? PREFETCH_MARGIN + 1 : PREFETCH_MARGIN;
    const wanted: number[] = [];
    for (let p = pageNumber - margin; p <= pageNumber + margin; p++) {
      if (p >= 1 && p <= pageCount) wanted.push(p);
    }
    this.pageLoader?.ensureLoaded(wanted);
    this.pageLoader?.releaseOutsideRange(Math.max(1, pageNumber - margin - 2), Math.min(pageCount, pageNumber + margin + 2));
  }

  // ---- layout recompute (requirement 2) ---------------------------------

  private observeResize(): void {
    this.resizeObserver = new ResizeObserver(() => this.scheduleRelayout());
    this.resizeObserver.observe(this.viewportEl);
  }

  private readonly handleOrientationChange = (): void => this.scheduleRelayout();

  private scheduleRelayout(): void {
    if (this.resizeTimer !== undefined) window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => this.relayout(), 120);
  }

  private relayout(): void {
    if (!this.engine) return;
    const size = { width: this.viewportEl.clientWidth, height: this.viewportEl.clientHeight };
    if (size.width === 0 || size.height === 0) return; // viewport temporarily hidden/unmeasured — nothing sane to compute yet
    this.engine.updateLayout(size, this.pageAspectRatio);
    this.zoomPan?.reset();
    if (this.engine) this.updatePageChrome(this.engine.currentPageNumber, this.engine.pageCount);
  }

  // ---- reduced motion (requirement 9) -----------------------------------

  private readonly handleMotionPreferenceChange = (): void => {
    if (!this.engine) return;
    const currentPage = this.engine.currentPageNumber;
    const pageCount = this.engine.pageCount;
    this.engine.destroy();
    this.mountFlipEngine(currentPage);
    this.zoomPan?.setReducedMotion(this.reducedMotionQuery.matches);
    this.zoomPan?.reset();
    this.updatePageChrome(currentPage, pageCount);
  };

  // ---- corner peel hint (requirement 8) ---------------------------------

  /** "Breathes once on first load" so visitors discover pages are draggable — skipped entirely under reduced motion (requirement 9), and never re-triggered after the first mount. */
  private applyFirstLoadCornerHint(): void {
    if (this.reducedMotionQuery.matches) return;
    this.viewportEl.classList.add("reader-hint-breathe");
    window.setTimeout(() => this.viewportEl.classList.remove("reader-hint-breathe"), 2200);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
