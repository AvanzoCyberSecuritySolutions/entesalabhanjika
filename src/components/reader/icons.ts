/**
 * Inline stroke-based icons for the reader chrome (back, prev/next, sound,
 * pages, close). Never emoji or dingbat glyphs (the old &larr;/&#8249;/✕/🔊
 * this replaces) — an inline SVG scales cleanly and recolors with
 * `currentColor`, matching whatever button state (hover, pressed) wraps it,
 * a glyph can't.
 *
 * One consistent style throughout: 2px stroke, round caps/joins, 24px
 * viewBox. Every icon is `aria-hidden` — the button it sits in always
 * carries its own accessible label/text.
 */
const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

function svg(size: number, body: string): string {
  return `<svg class="reader-icon" viewBox="0 0 24 24" width="${size}" height="${size}" ${STROKE} aria-hidden="true">${body}</svg>`;
}

export const ICON_ARROW_LEFT = svg(20, `<path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/>`);

export const ICON_CHEVRON_LEFT = svg(22, `<path d="M15 18l-6-6 6-6"/>`);
export const ICON_CHEVRON_RIGHT = svg(22, `<path d="M9 18l6-6-6-6"/>`);

export const ICON_SOUND_ON = svg(18, `<path d="M4 9v6h4l5 5V4L8 9H4Z"/><path d="M16.2 8.8a5 5 0 0 1 0 6.4"/><path d="M19 6a9 9 0 0 1 0 12"/>`);
export const ICON_SOUND_OFF = svg(18, `<path d="M4 9v6h4l5 5V4L8 9H4Z"/><path d="M17 9l5 6M22 9l-5 6"/>`);

export const ICON_PAGES = svg(
  18,
  `<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>`
);

export const ICON_CLOSE = svg(16, `<path d="M6 6l12 12M18 6L6 18"/>`);

export const ICON_CHECK = svg(16, `<path d="M20 6L9 17l-5-5"/>`);
