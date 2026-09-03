/**
 * Zoom + pan + the peel-vs-pan gesture arbitration (requirement 3 — "Fit is
 * a mode", CONTEXT.md § Fit). This is the hardest part of the reader, so
 * the arbitration rule gets written down once, here, in full:
 *
 *   AT ANY INSTANT, EXACTLY ONE FACT DECIDES WHETHER A ONE-FINGER DRAG
 *   PEELS OR PANS: is the current zoom level above Fit (1.0) or not.
 *
 *   - At Fit: this module does nothing to a single-pointer drag. It never
 *     calls preventDefault/stopPropagation on it, so the event keeps
 *     travelling to StPageFlip's own listeners on the flip block beneath,
 *     which peel the page exactly as it would with no wrapper involved.
 *   - Above Fit: this module owns the drag from the moment it exceeds the
 *     10px move threshold (same threshold the legacy reader.html used to
 *     tell a click from a drag — kept deliberately, see TAP_MOVE_THRESHOLD_PX)
 *     and calls preventDefault/stopPropagation on every further event for
 *     that pointer, so StPageFlip's listeners never see it and cannot
 *     start a peel while the visitor is panning.
 *
 * That "exceeds 10px, above Fit" check happens exactly once per drag, the
 * instant the pointer first moves past the threshold — not re-evaluated
 * continuously — so a single drag can never flip between peeling and
 * panning partway through.
 *
 * A tap (never exceeds the threshold) is handled by this module at any
 * zoom level and turns the page via the tap-zone rule (left half = back,
 * right half = forward) — this is also what implements requirement 4's
 * click/tap-to-turn, on every input type, since StPageFlip's own built-in
 * tap-to-flip only fires reliably for mouse (its touch path requires a
 * fast >30px swipe or a >5px hold-drag — a plain quick tap does nothing in
 * the underlying library). Re-implementing tap-to-turn here once, for both
 * mouse and touch, is simpler than depending on that asymmetry.
 *
 * Two DIFFERENT low-level event families have to be intercepted, matching
 * whatever StPageFlip itself listens to (node_modules/page-flip/src/UI/UI.ts):
 * raw MouseEvents and raw TouchEvents — NOT the unified Pointer Events API.
 * Pointer Events and Touch Events are dispatched independently by the
 * browser for the same physical touch (both fire; neither's
 * stopPropagation affects the other), so intercepting only PointerEvents
 * would leave StPageFlip's TouchEvent listeners completely unblocked.
 * Hence the two near-identical adapters below feed one shared arbiter.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export const ZOOM_FIT = 1;
const ZOOM_MAX = 4;
const ZOOM_DOUBLE_TAP_TARGET = 2.25;
const WHEEL_ZOOM_SENSITIVITY = 0.0018;
const ZOOM_EPSILON = 0.001;

/** Legacy reader.html's click-vs-drag threshold (see reader.html's old `mouseup` handler) — kept for the same reason: small pointer jitter shouldn't be read as an intentional drag. */
export const TAP_MOVE_THRESHOLD_PX = 10;
const DOUBLE_TAP_WINDOW_MS = 300;
const DOUBLE_TAP_MAX_DISTANCE_PX = 40;

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Clamp pan so the zoomed content can never be dragged off into empty
 * space (requirement 3's last bullet). `content` is the book's box size at
 * zoom 1 (Fit); at a given `zoom`, the displayed size is `content * zoom`,
 * and the maximum offset in either axis is half of however much that
 * exceeds the viewport — beyond that, empty space would show.
 */
export function clampPan(pan: Vec2, content: { width: number; height: number }, zoom: number, viewport: { width: number; height: number }): Vec2 {
  const maxX = Math.max(0, (content.width * zoom - viewport.width) / 2);
  const maxY = Math.max(0, (content.height * zoom - viewport.height) / 2);
  return {
    x: clampNumber(pan.x, -maxX, maxX),
    y: clampNumber(pan.y, -maxY, maxY),
  };
}

/**
 * Pan that keeps a given focal point (viewport coordinates, origin at
 * viewport centre — matching the `translate() scale()` transform's own
 * `transform-origin: center`) visually fixed while zooming from
 * `fromZoom`/`fromPan` to `toZoom`. Shared by wheel-zoom, double-tap/
 * double-click-zoom, and every pinch frame.
 */
function panForZoomAtFocal(focal: Vec2, fromZoom: number, fromPan: Vec2, toZoom: number): Vec2 {
  const contentPoint: Vec2 = {
    x: (focal.x - fromPan.x) / fromZoom,
    y: (focal.y - fromPan.y) / fromZoom,
  };
  return {
    x: focal.x - toZoom * contentPoint.x,
    y: focal.y - toZoom * contentPoint.y,
  };
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export type TapZone = "left" | "right";

export interface ZoomPanDeps {
  /** Ancestor of both the flip block and everything else — capture-phase listeners live here so they see gestures regardless of what's beneath. */
  viewport: HTMLElement;
  /** The element the CSS transform (translate + scale) is applied to. Must wrap the StPageFlip root with nothing else affecting its box size. */
  surface: HTMLElement;
  /** Current book box size at zoom 1 (Fit), in CSS px — read fresh per gesture since it changes on layout recompute (requirement 2). */
  getContentSize: () => { width: number; height: number };
  /** A tap that didn't turn into a drag, resolved to which half of the book it landed in. */
  onTapZone: (zone: TapZone) => void;
  /** Fires whenever the zoom level changes, including the reset-to-Fit that happens on every page turn (requirement 3: "Turning always snaps back to Fit"). */
  onZoomChange: (zoom: number, atFit: boolean) => void;
}

type DragOutcome = "undecided" | "pass-through" | "pan";

/** Per-pointer drag-tracking state, shared shape whether the source was a MouseEvent or a single TouchEvent. */
interface DragTrack {
  startX: number;
  startY: number;
  outcome: DragOutcome;
  /** Zoom/pan captured at drag start, so pan deltas are relative to a fixed baseline rather than accumulating rounding error frame to frame. */
  baseZoom: number;
  basePan: Vec2;
}

interface PinchTrack {
  prevDistance: number;
  prevZoom: number;
  prevPan: Vec2;
}

interface PendingTap {
  x: number;
  y: number;
  time: number;
}

export class ZoomPanController {
  private zoom = ZOOM_FIT;
  private pan: Vec2 = { x: 0, y: 0 };

  private drag: DragTrack | null = null;
  private pinch: PinchTrack | null = null;
  private lastTap: PendingTap | null = null;
  private reducedMotion = false;

  private readonly deps: ZoomPanDeps;

  constructor(deps: ZoomPanDeps) {
    this.deps = deps;
    this.apply();
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.deps.surface.style.transition = reduced ? "none" : "transform 220ms ease-out";
  }

  get isAtFit(): boolean {
    return this.zoom <= ZOOM_FIT + ZOOM_EPSILON;
  }

  getZoom(): number {
    return this.zoom;
  }

  /** Requirement 3: "Turning always snaps back to Fit." Called by reader.ts before every page turn, from every input source (buttons, keyboard, tap zones, jump-to-page). */
  reset(): void {
    this.setZoomAtViewportCenter(ZOOM_FIT);
  }

  /** ctrl/cmd+wheel and pinch entry points both fall through to this once they've computed a target zoom + focal point. */
  private setZoomAt(focal: Vec2, targetZoom: number): void {
    const clampedZoom = clampNumber(targetZoom, ZOOM_FIT, ZOOM_MAX);
    const rawPan = panForZoomAtFocal(focal, this.zoom, this.pan, clampedZoom);
    this.zoom = clampedZoom;
    this.pan = clampPan(rawPan, this.deps.getContentSize(), this.zoom, this.viewportSize());
    this.apply();
  }

  private setZoomAtViewportCenter(targetZoom: number): void {
    this.setZoomAt({ x: 0, y: 0 }, targetZoom);
  }

  private viewportSize(): { width: number; height: number } {
    const rect = this.deps.viewport.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  /** Viewport-relative point with the origin at the viewport's centre, matching the transform's `transform-origin: center`. */
  private toFocal(clientX: number, clientY: number): Vec2 {
    const rect = this.deps.viewport.getBoundingClientRect();
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  }

  private apply(): void {
    this.deps.surface.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
    this.deps.onZoomChange(this.zoom, this.isAtFit);
  }

  // ---- gesture wiring -----------------------------------------------

  private readonly onWheel = (e: WheelEvent): void => {
    if (!e.ctrlKey && !e.metaKey) return; // plain wheel: not our gesture, leave the page alone
    e.preventDefault();
    const focal = this.toFocal(e.clientX, e.clientY);
    const targetZoom = this.zoom * Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY);
    this.setZoomAt(focal, targetZoom);
  };

  private beginDrag(x: number, y: number): void {
    this.drag = { startX: x, startY: y, outcome: "undecided", baseZoom: this.zoom, basePan: this.pan };
  }

  /** Returns what the caller should do with the *native* event: "own" (preventDefault/stopPropagation, we're panning) or "release" (do nothing further, let StPageFlip's own listener handle it — the pass-through half of the arbitration rule). */
  private continueDrag(x: number, y: number): "own" | "release" | "ignore" {
    const drag = this.drag;
    if (!drag) return "ignore";

    if (drag.outcome === "undecided") {
      const moved = distance({ x, y }, { x: drag.startX, y: drag.startY });
      if (moved <= TAP_MOVE_THRESHOLD_PX) return "ignore"; // still could be a tap — decide nothing yet
      // The one-time decision: above Fit we pan, at Fit StPageFlip peels.
      drag.outcome = drag.baseZoom > ZOOM_FIT + ZOOM_EPSILON ? "pan" : "pass-through";
    }

    if (drag.outcome === "pass-through") return "release";

    const dx = x - drag.startX;
    const dy = y - drag.startY;
    const raw: Vec2 = { x: drag.basePan.x + dx, y: drag.basePan.y + dy };
    this.pan = clampPan(raw, this.deps.getContentSize(), this.zoom, this.viewportSize());
    this.apply();
    return "own";
  }

  private endDrag(x: number, y: number, time: number): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag || drag.outcome === "pass-through") return; // native click-to-flip / peel already own this one

    if (drag.outcome === "undecided") {
      // Never exceeded the threshold: a tap. Resolve double-tap vs single tap vs tap-zone turn.
      this.resolveTap(x, y, time);
    }
    // outcome === "pan": nothing further to do, the drag already applied via continueDrag.
  }

  private resolveTap(x: number, y: number, time: number): void {
    const prior = this.lastTap;
    this.lastTap = { x, y, time };

    if (prior && time - prior.time <= DOUBLE_TAP_WINDOW_MS && distance({ x, y }, prior) <= DOUBLE_TAP_MAX_DISTANCE_PX) {
      this.lastTap = null; // consumed — don't chain into a triple-tap
      const focal = this.toFocal(x, y);
      this.setZoomAt(focal, this.isAtFit ? ZOOM_DOUBLE_TAP_TARGET : ZOOM_FIT);
      return;
    }

    const rect = this.deps.viewport.getBoundingClientRect();
    const zone: TapZone = x - rect.left < rect.width / 2 ? "left" : "right";
    this.deps.onTapZone(zone);
  }

  // -- mouse adapter --

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    this.beginDrag(e.clientX, e.clientY);
    // Above Fit the outcome of *any* drag starting now is already known
    // (it will pan, never peel) — claim the gesture from mousedown itself
    // rather than waiting for the move threshold, so StPageFlip's own
    // mousedown handler never sees it and never arms `isUserTouch`.
    if (!this.isAtFit) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.drag) return;
    const result = this.continueDrag(e.clientX, e.clientY);
    if (result === "own") {
      e.preventDefault();
      e.stopPropagation();
    }
    // "release": deliberately untouched — StPageFlip's own window-level mousemove listener still receives it.
  };

  private readonly onMouseUp = (e: MouseEvent): void => {
    if (!this.drag) return;
    const owned = this.drag.outcome === "pan" || this.drag.outcome === "undecided";
    this.endDrag(e.clientX, e.clientY, e.timeStamp);
    if (owned) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // -- touch adapter --

  private readonly onTouchStart = (e: TouchEvent): void => {
    if (e.touches.length === 2) {
      this.drag = null; // a pinch pre-empts any single-finger gesture in progress
      const t0 = e.touches.item(0);
      const t1 = e.touches.item(1);
      if (!t0 || !t1) return;
      const midpoint = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
      this.pinch = {
        prevDistance: distance({ x: t0.clientX, y: t0.clientY }, { x: t1.clientX, y: t1.clientY }),
        prevMidpoint: this.toFocal(midpoint.x, midpoint.y),
        prevZoom: this.zoom,
        prevPan: this.pan,
      };
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (e.touches.length === 1 && !this.pinch) {
      const t = e.touches.item(0);
      if (!t) return;
      this.beginDrag(t.clientX, t.clientY);
      if (!this.isAtFit) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  };

  private readonly onTouchMove = (e: TouchEvent): void => {
    if (this.pinch && e.touches.length === 2) {
      const t0 = e.touches.item(0);
      const t1 = e.touches.item(1);
      if (!t0 || !t1) return;
      const currentDistance = distance({ x: t0.clientX, y: t0.clientY }, { x: t1.clientX, y: t1.clientY });
      const midpoint = this.toFocal((t0.clientX + t1.clientX) / 2, (t0.clientY + t1.clientY) / 2);
      const pinch = this.pinch;
      const targetZoom = clampNumber(pinch.prevZoom * (currentDistance / pinch.prevDistance), ZOOM_FIT, ZOOM_MAX);
      const rawPan = panForZoomAtFocal(midpoint, pinch.prevZoom, pinch.prevPan, targetZoom);
      this.zoom = targetZoom;
      this.pan = clampPan(rawPan, this.deps.getContentSize(), this.zoom, this.viewportSize());
      this.apply();
      this.pinch = { prevDistance: currentDistance, prevMidpoint: midpoint, prevZoom: this.zoom, prevPan: this.pan };
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (!this.drag || e.touches.length !== 1) return;
    const t = e.touches.item(0);
    if (!t) return;
    const result = this.continueDrag(t.clientX, t.clientY);
    if (result === "own") {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  private readonly onTouchEnd = (e: TouchEvent): void => {
    if (this.pinch) {
      if (e.touches.length < 2) this.pinch = null;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!this.drag) return;
    const owned = this.drag.outcome === "pan" || this.drag.outcome === "undecided";
    const t = e.changedTouches.item(0);
    if (t) this.endDrag(t.clientX, t.clientY, e.timeStamp);
    else this.drag = null;
    if (owned) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  private readonly onTouchCancel = (): void => {
    this.drag = null;
    this.pinch = null;
  };

  attach(): void {
    const v = this.deps.viewport;
    // Capture phase throughout: these must see (and be able to pre-empt)
    // the gesture before it reaches StPageFlip's own listeners deeper in
    // the tree — see the module docstring.
    v.addEventListener("wheel", this.onWheel, { capture: true, passive: false });
    v.addEventListener("mousedown", this.onMouseDown, { capture: true });
    v.addEventListener("mousemove", this.onMouseMove, { capture: true });
    v.addEventListener("mouseup", this.onMouseUp, { capture: true });
    v.addEventListener("touchstart", this.onTouchStart, { capture: true, passive: false });
    v.addEventListener("touchmove", this.onTouchMove, { capture: true, passive: false });
    v.addEventListener("touchend", this.onTouchEnd, { capture: true, passive: false });
    v.addEventListener("touchcancel", this.onTouchCancel, { capture: true });
  }

  detach(): void {
    const v = this.deps.viewport;
    v.removeEventListener("wheel", this.onWheel, true);
    v.removeEventListener("mousedown", this.onMouseDown, true);
    v.removeEventListener("mousemove", this.onMouseMove, true);
    v.removeEventListener("mouseup", this.onMouseUp, true);
    v.removeEventListener("touchstart", this.onTouchStart, true);
    v.removeEventListener("touchmove", this.onTouchMove, true);
    v.removeEventListener("touchend", this.onTouchEnd, true);
    v.removeEventListener("touchcancel", this.onTouchCancel, true);
  }
}
