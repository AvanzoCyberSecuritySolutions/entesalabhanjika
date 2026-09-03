---
status: accepted
---

# A build step, and derived page images generated at build time

The site was build-free: hand-vendored dependencies, Tailwind pulled from
`cdn.tailwindcss.com` (which ships the whole compiler to every visitor), and page
scans committed as PNG. PNG is a lossless format meant for flat graphics, and
using it for photographs of paper cost roughly 5 MB per page — `edition2.html`
was an 84 MB page load, and `in-house.html` downloaded 59.5 MB of PDF purely to
draw three cover thumbnails. No amount of front-end polish survives that, so
correcting it took priority over the reader work that prompted this rebuild.

We adopted Vite as a multi-page build with TypeScript, and a `scripts/build-assets`
step that renders PDFs with poppler and re-encodes scans into responsive WebP at
three widths plus thumbnails. Derived images are gitignored; only the
authoritative sources are tracked. The build enforces a payload budget — roughly
600 KB for a reader page, 400 KB for the homepage, 300 KB per derived image — and
fails rather than shipping a regression, because a budget is the only mechanism
that prevents this class of problem recurring.

## Considered options

**Convert the images once by hand and stay build-free.** Would have delivered
most of the performance win immediately with no new tooling. Rejected because it
is not reproducible: the next batch of scans repeats the manual work, and the
discipline decays the first time someone is in a hurry.

**Commit the derived WebP alongside the sources.** Would let any host serve the
repository directly with no build. Rejected because it grows the repository
indefinitely and turns every re-encode into a large binary diff.

## Consequences

The site can no longer be deployed by copying the repository — Coolify now builds
from a multi-stage Dockerfile, because `poppler-utils` is not present in a stock
Node image and the asset step requires it. Contributors need Node and poppler
locally to preview page images. Adding `package.json` also changes how Coolify
auto-detects the project, so the build strategy must be set explicitly before
this lands on the deployed branch.
