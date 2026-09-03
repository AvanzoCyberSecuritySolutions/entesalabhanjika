# Entesalabhanjika

A static reading site: visitors browse curated shelves of scanned
publications and read them in a page-turning reader. See `CONTEXT.md` for
the domain glossary (Publication, Edition, Book, Collection, Page,
PageSource, Spread, Placeholder Publication, Fit) and `docs/adr/` for the
two decisions that shape this build (StPageFlip over turn.js; a build-time
asset pipeline over committed PNGs).

## Install

```
npm install
```

Building images also requires [poppler-utils](https://poppler.freedesktop.org/)
on PATH (`pdftoppm`/`pdftocairo`) — `scripts/build-assets.ts` shells out to
it for PDF-backed Publications. The Docker build stage installs it
automatically; for local `npm run build`, install it yourself
(`apt-get install poppler-utils` / `brew install poppler`).

## Develop

```
npm run dev
```

Starts the Vite dev server against the MPA entries in `src/pages/`.

## Build

```
npm run build
```

Runs `scripts/build-assets.ts` (converts sources under `content/sources/`
into derived WebP, per `content/derived-assets.ts`) and then `vite build`.
Output goes to `dist/`.

`npm run typecheck` runs `tsc --noEmit` on its own, independent of the
Vite build.

## Directory layout

- `content/` — the Publication manifest and its contracts.
  - `publication.ts` — the `Publication`/`Collection` types.
  - `publications.ts` — the manifest array (`publications: Publication[]`),
    currently a stub.
  - `derived-assets.ts` — the derived-asset contract: where
    `scripts/build-assets.ts` writes derived WebP/thumbnails, at what
    widths, under what filename convention. Both the asset pipeline and
    `src/page-sources/*` import this file so they can't drift apart.
  - `sources/` — authoritative source scans/PDFs, tracked in git. Derived
    output is gitignored and regenerated from these.
- `scripts/` — `build-assets.ts`, the build-time asset pipeline (ADR 0002).
- `src/pages/` — one HTML file per MPA entry. `vite.config.ts` derives most
  of its Rollup `input` map from `content/publications.ts` at config time;
  see `resolveEntries()` there for the convention a new Publication's page
  needs to follow.
- `src/components/navbar/` — the site navbar component.
- `src/components/reader/` — the page-turning reader (StPageFlip-based;
  ADR 0001).
- `src/page-sources/` — `PageSource.ts`, the interface the reader uses to
  read Pages without knowing whether they come from pre-exported scan
  images or a PDF, plus its two implementations (`ImagePageSource`,
  `PdfPageSource`).
- `src/styles/` — Tailwind entry point and any global CSS. Tailwind runs as
  a real PostCSS build (`tailwind.config.js`) now, not the
  `cdn.tailwindcss.com` script tag the legacy pages use.

## Deployment

Multi-stage `Dockerfile`: a Node build stage (with poppler-utils) runs the
asset pipeline and `vite build`; an nginx stage (`nginx.conf`) serves
`dist/` with long-lived immutable caching on hashed/derived assets and
`no-cache` on HTML so deploys are picked up immediately. Coolify builds
this Dockerfile directly — no Coolify settings are touched by this repo.
