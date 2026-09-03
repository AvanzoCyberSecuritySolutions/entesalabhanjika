/**
 * FakePageSource — an in-memory PageSource for tests and for developing
 * the reader (src/components/reader/**) without a real build:assets run
 * or a network. Holds no files, no fetch, no timers unless asked for —
 * just returns whatever PageAssets it was configured with, or a synthetic
 * default for any page not explicitly configured.
 */

import type { PageAsset, PageSource, PageSourceAbortError, PageSourceKind, PageSourceRequestOptions } from "./PageSource";

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError") as PageSourceAbortError;
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((res, rej) => {
    const timer = setTimeout(res, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        rej(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

export interface FakePageSourceOptions {
  /** Reported via PageSource.kind — diagnostics only, defaults to "image-scans". */
  kind?: PageSourceKind;
  pageCount: number;
  /** Per-page overrides. Any page not listed here gets a synthetic default (see defaultPageFor). */
  pages?: Partial<Record<number, PageAsset>>;
  /** Simulated latency for load()/getPage()/getThumbnail(), in ms. Default 0 (resolves same-microtask-ish, still genuinely async). */
  delayMs?: number;
}

/** Default asset handed back for any page a FakePageSource wasn't explicitly configured with. */
function defaultPageFor(pageNumber: number): PageAsset {
  return {
    pageNumber,
    intrinsicWidth: 800,
    intrinsicHeight: 1200,
    candidates: [{ width: 800, url: `fake://page-source/page/${pageNumber}` }],
  };
}

export class FakePageSource implements PageSource {
  readonly kind: PageSourceKind;

  private readonly options: FakePageSourceOptions;
  private loaded = false;

  constructor(options: FakePageSourceOptions) {
    this.kind = options.kind ?? "image-scans";
    this.options = options;
  }

  get pageCount(): number {
    if (!this.loaded) {
      throw new Error("FakePageSource: pageCount read before load() resolved.");
    }
    return this.options.pageCount;
  }

  async load(options?: PageSourceRequestOptions): Promise<void> {
    throwIfAborted(options?.signal);
    await delay(this.options.delayMs ?? 0, options?.signal);
    this.loaded = true;
  }

  async getPage(pageNumber: number, options?: PageSourceRequestOptions): Promise<PageAsset> {
    throwIfAborted(options?.signal);
    await delay(this.options.delayMs ?? 0, options?.signal);
    return this.options.pages?.[pageNumber] ?? defaultPageFor(pageNumber);
  }

  async getThumbnail(pageNumber: number, options?: PageSourceRequestOptions): Promise<PageAsset> {
    throwIfAborted(options?.signal);
    await delay(this.options.delayMs ?? 0, options?.signal);
    const page = this.options.pages?.[pageNumber] ?? defaultPageFor(pageNumber);
    const smallest = page.candidates[0] ?? { width: 100, url: `fake://page-source/thumb/${pageNumber}` };
    return { ...page, candidates: [smallest] };
  }

  dispose(): void {
    this.loaded = false;
  }
}
