/**
 * The layout rule (requirement 2): Spread vs single Page is decided by
 * CONTAINER ASPECT RATIO, never a viewport-width breakpoint.
 *
 * StPageFlip (in "stretch" size mode) already collapses to a single page
 * when its root element's width is less than `2 * settings.minWidth` — see
 * node_modules/page-flip/src/Render/Render.ts#calculateBoundsRect. But
 * `minWidth` is just a constant on the settings object, fixed once at
 * construction time by default, which makes the *default* behaviour a
 * fixed-pixel breakpoint (exactly the anti-pattern this reader must not
 * have — a phone in landscape and a tablet in portrait could have the same
 * width and get the same layout despite very different heights).
 *
 * The fix: before every relayout we recompute `minWidth`/`maxWidth` as "the
 * width one Page would need to fill the container's current height at the
 * source's aspect ratio", and write it into StPageFlip's (mutable, by
 * reference) settings object. That turns its width-only check into a
 * true aspect-ratio check: a Spread now only fits when
 *   containerWidth >= 2 * containerHeight * pageAspectRatio
 * — pin the container's height in place and shrink its width, and this
 * flips to single-Page; pin the width and shrink the height (a phone
 * rotated to landscape, height shrinking), and the threshold width drops
 * too, so a short-but-wide container still gets a Spread. This is the
 * "container aspect ratio, not a breakpoint" requirement made concrete.
 */

export interface ContainerSize {
  width: number;
  height: number;
}

/** width / height of a single Page, per CONTEXT.md § Page — assumed uniform across a Publication (see flip-engine.ts's docstring on why). */
export type PageAspectRatio = number;

export interface StretchBounds {
  minWidth: number;
  maxWidth: number;
}

/**
 * The minWidth/maxWidth pair to write onto StPageFlip's settings object
 * ahead of calling its `update()`. Pinning min and max to the same value
 * means "the natural width for one Page at this container's height" is
 * both the floor StPageFlip uses for its Spread-vs-single decision AND the
 * ceiling it clamps rendering to — i.e. we are fully driving the size, not
 * just hinting it.
 */
export function computeStretchBounds(container: ContainerSize, pageAspectRatio: PageAspectRatio): StretchBounds {
  const singlePageWidthAtContainerHeight = Math.max(1, container.height * pageAspectRatio);
  return {
    minWidth: singlePageWidthAtContainerHeight,
    maxWidth: singlePageWidthAtContainerHeight,
  };
}

/**
 * Pure predicate mirroring StPageFlip's own Spread-vs-single check, kept
 * here (rather than only asking the engine after the fact) so the rule is
 * independently testable and so other reader modules (e.g. thumbnails
 * sizing) can reason about layout without importing the flip engine.
 */
export function wouldShowSpread(container: ContainerSize, pageAspectRatio: PageAspectRatio): boolean {
  const { minWidth } = computeStretchBounds(container, pageAspectRatio);
  return container.width >= minWidth * 2;
}
