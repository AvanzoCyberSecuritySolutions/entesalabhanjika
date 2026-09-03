/**
 * The scrubbable thumbnail strip (requirement 7). Lazy: 155 pages means 155
 * possible thumbnail requests, but only the ones that actually scroll into
 * view are ever fetched, via an IntersectionObserver over the strip's own
 * scroll container — never PageSource.getThumbnail() for the whole
 * Publication up front.
 *
 * Dismissible by design: the strip is a bottom drawer, closed by default
 * and toggled from reader.ts's controls bar, with a fixed max height so it
 * can never take over a phone screen (requirement 7's "must not eat the
 * screen on a phone").
 */

import type { PageSource } from "../../page-sources/PageSource";
import { ICON_CLOSE } from "./icons";

export interface ThumbnailStripOptions {
  pageSource: PageSource;
  pageCount: number;
  onSelect: (pageNumber: number) => void;
}

export class ThumbnailStrip {
  readonly element: HTMLElement;

  private readonly pageSource: PageSource;
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly observer: IntersectionObserver;
  private readonly inFlight = new Set<AbortController>();
  private open = false;

  constructor(options: ThumbnailStripOptions) {
    this.pageSource = options.pageSource;

    this.element = document.createElement("div");
    this.element.className = "reader-thumbnail-drawer";
    this.element.hidden = true;

    const header = document.createElement("div");
    header.className = "reader-thumbnail-drawer-header";
    const heading = document.createElement("span");
    heading.textContent = "Pages";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "reader-thumbnail-close";
    closeBtn.setAttribute("aria-label", "Close page thumbnails");
    closeBtn.innerHTML = ICON_CLOSE;
    closeBtn.addEventListener("click", () => this.toggle(false));
    header.append(heading, closeBtn);

    const strip = document.createElement("div");
    strip.className = "reader-thumbnail-strip";
    strip.setAttribute("role", "listbox");
    strip.setAttribute("aria-label", "Jump to page");

    this.observer = new IntersectionObserver(this.onIntersect, {
      root: strip,
      rootMargin: "200px",
      threshold: 0.01,
    });

    for (let i = 0; i < options.pageCount; i++) {
      const pageNumber = i + 1;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "reader-thumbnail";
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-label", `Go to page ${pageNumber}`);
      btn.dataset.pageNumber = String(pageNumber);
      btn.addEventListener("click", () => options.onSelect(pageNumber));
      strip.appendChild(btn);
      this.buttons.push(btn);
      this.observer.observe(btn);
    }

    this.element.append(header, strip);
  }

  private readonly onIntersect: IntersectionObserverCallback = (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const btn = entry.target as HTMLButtonElement;
      this.observer.unobserve(btn);
      this.loadThumbnail(btn);
    }
  };

  private loadThumbnail(btn: HTMLButtonElement): void {
    const pageNumber = Number(btn.dataset.pageNumber);
    if (!Number.isInteger(pageNumber) || btn.querySelector("img")) return;

    const controller = new AbortController();
    this.inFlight.add(controller);

    this.pageSource
      .getThumbnail(pageNumber, { signal: controller.signal })
      .then((asset) => {
        if (controller.signal.aborted) return;
        const largest = asset.candidates[asset.candidates.length - 1];
        if (!largest) return;
        const img = document.createElement("img");
        img.src = largest.url;
        img.alt = "";
        img.loading = "lazy";
        img.decoding = "async";
        btn.appendChild(img);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error(`[reader] failed to load thumbnail for page ${pageNumber}`, err);
      })
      .finally(() => {
        this.inFlight.delete(controller);
      });
  }

  setCurrentPage(pageNumber: number): void {
    for (const btn of this.buttons) {
      const isCurrent = btn.dataset.pageNumber === String(pageNumber);
      btn.classList.toggle("is-current", isCurrent);
      btn.setAttribute("aria-selected", String(isCurrent));
      if (isCurrent && this.open) btn.scrollIntoView({ block: "nearest", inline: "center" });
    }
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.element.hidden = !this.open;
  }

  dispose(): void {
    this.observer.disconnect();
    for (const controller of this.inFlight) controller.abort();
    this.inFlight.clear();
  }
}
