/**
 * Ambient types for the `page-flip` npm package (StPageFlip, MIT, see ADR
 * 0001). The published package ships zero `.d.ts` files — `package.json`
 * has no `types`/`typings` field and `dist/` contains only the two bundled
 * JS builds — so under `strict` TypeScript this module is otherwise
 * `any`. This file is hand-written against `node_modules/page-flip/src/`
 * (the library's own TypeScript source, which IS accurate, just never
 * published), trimmed to the subset flip-engine.ts actually calls.
 *
 * Only this file and flip-engine.ts are allowed to know these shapes exist
 * (CONTEXT.md-adjacent rule enforced by convention, not the compiler):
 * every other reader module talks to flip-engine.ts's own interface.
 */
declare module "page-flip" {
  /** Whether the book's box is a fixed pixel size or stretches to its parent. flip-engine.ts always uses "stretch". */
  export type SizeType = "fixed" | "stretch";

  /** Active corner when a flip is triggered programmatically. */
  export type FlipCorner = "top" | "bottom";

  /** StPageFlip's internal interaction state, passed to 'changeState' listeners. */
  export type FlippingState = "user_fold" | "fold_corner" | "flipping" | "read";

  /** Page orientation StPageFlip is currently rendering: two pages side by side, or one. */
  export type Orientation = "portrait" | "landscape";

  export interface FlipSetting {
    startPage: number;
    size: SizeType;
    width: number;
    height: number;
    minWidth: number;
    maxWidth: number;
    minHeight: number;
    maxHeight: number;
    drawShadow: boolean;
    flippingTime: number;
    usePortrait: boolean;
    startZIndex: number;
    autoSize: boolean;
    maxShadowOpacity: number;
    showCover: boolean;
    mobileScrollSupport: boolean;
    clickEventForward: boolean;
    useMouseEvents: boolean;
    swipeDistance: number;
    showPageCorners: boolean;
    disableFlipByClick: boolean;
  }

  export interface PageRect {
    left: number;
    top: number;
    width: number;
    height: number;
    /** Width of a single page: equals `width` in portrait, half of it in landscape. */
    pageWidth: number;
  }

  export type EventDataType = number | string | boolean | object;

  export interface WidgetEvent {
    data: EventDataType;
    object: PageFlip;
  }

  export type EventCallback = (e: WidgetEvent) => void;

  /**
   * Root class. Constructed once per mounted book; `loadFromHTML` /
   * `updateFromHtml` replace its page collection.
   *
   * Event names actually fired (from PageFlip.ts's `this.trigger(...)`
   * call sites): "init", "update", "flip" (data: new 0-based page index),
   * "changeState" (data: FlippingState), "changeOrientation" (data:
   * Orientation).
   */
  export class PageFlip {
    constructor(inBlock: HTMLElement, setting: Partial<FlipSetting>);

    destroy(): void;
    update(): void;

    loadFromHTML(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
    updateFromHtml(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
    clear(): void;

    turnToPrevPage(): void;
    turnToNextPage(): void;
    turnToPage(page: number): void;

    flipNext(corner?: FlipCorner): void;
    flipPrev(corner?: FlipCorner): void;
    flip(page: number, corner?: FlipCorner): void;

    getPageCount(): number;
    getCurrentPageIndex(): number;
    getOrientation(): Orientation;
    getBoundsRect(): PageRect;
    /** Returns the live settings object by reference — mutating its properties (e.g. minWidth/maxWidth) and then calling update() is StPageFlip's supported-in-practice path for dynamic re-layout; there is no separate setter. */
    getSettings(): FlipSetting;
    getState(): FlippingState;

    on(event: string, callback: EventCallback): PageFlip;
    off(event: string): void;
  }
}
