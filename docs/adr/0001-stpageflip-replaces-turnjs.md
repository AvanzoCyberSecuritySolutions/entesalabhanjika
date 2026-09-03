---
status: accepted
---

# StPageFlip replaces turn.js as the page-turn engine

The site's page-turn effect was built on a vendored copy of turn.js 4.1.0, which
requires jQuery, has had no upstream release since 2014, and belongs to turn.js's
commercial-licensed 4.x branch — the freely licensed line stopped at 3.x, so our
right to ship this file on a public site was never established. It also has no
real resize path: the edition pages worked around this by calling
`location.reload()` whenever the viewport crossed a breakpoint. We replaced it
with StPageFlip (MIT, zero dependencies, ~30 KB, TypeScript), which supports the
same physical-book behaviour we want — soft and hard pages, spine shadows,
drag-to-peel — and collapses a Spread to a single Page on narrow viewports
natively. This lets us delete both `turn.js` and `jquery.js` from the repository.

## Considered options

**Keep turn.js and work around it.** Cheapest in the short term and preserves the
existing markup, but leaves the licensing question open indefinitely, keeps a
161 KB jQuery dependency alive solely to serve it, and makes a genuinely
responsive reader impossible — the reload hack cannot be removed while turn.js
drives the layout.

**Write a custom CSS-3D page-turn.** Total control over feel and no third-party
licence at all, but convincing paper-curl physics is a large, high-risk build.
We were not prepared to spend that budget before the site's much larger
performance problems were fixed.

## Consequences

Every existing flipbook call site is rewritten; turn.js markup conventions
(`class="hard"`, the `$(...).turn()` initialiser) do not carry over. Losing
jQuery means the small amount of unrelated jQuery-dependent code on the edition
pages must be ported to plain DOM APIs at the same time.
