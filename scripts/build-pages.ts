/**
 * Generates one static HTML page per readable Publication, plus the
 * coming-soon pages, from the manifest.
 *
 * Why generate rather than hand-write: the old site had edition1.html through
 * edition5.html differing by a single <img> tag — roughly 1,380 lines
 * expressing four rows of data. Generating means adding a Publication is a
 * manifest entry and nothing else, while each Publication still gets a real
 * URL, its own <title>, and its own OG tags for sharing (which a single
 * query-parameter reader could not provide).
 *
 * Output is gitignored; vite.config.ts picks the files up via existsSync, so
 * this must run before `vite build`.
 */
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { publications } from "../content/publications";
import { derivedCoverUrl } from "../content/derived-assets";
import type { Publication } from "../content/publication";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pagesDir = resolve(projectRoot, "src/pages");
const readerPagesDir = resolve(pagesDir, "reader");

/** Sections announced in the nav but not yet written. Real routes so the urls are final now and only the body changes later; noindex so search engines do not index empty pages. */
const COMING_SOON: readonly { slug: string; title: string; blurb: string }[] = [
  { slug: "editor", title: "Editor", blurb: "Notes from the editor's desk." },
  { slug: "writer", title: "Writer", blurb: "Voices and writing from our contributors." },
  { slug: "feedback", title: "Feedback", blurb: "Tell us what you think of the magazine." },
];

const SITE_NAME = "Ente Salabhanjika";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function describe(pub: Publication): string {
  return pub.kind === "edition"
    ? `Read ${pub.title} of ${SITE_NAME} online — a page-turning reader for the full issue.`
    : `Read ${pub.title} online — a page-turning reader for the complete book.`;
}

/** Shared <head> content. Every page gets a description and OG tags; the old site had none on any page, so shared links rendered as bare urls. */
function head(opts: { title: string; description: string; image?: string; noindex?: boolean }): string {
  const title = escapeHtml(opts.title);
  const description = escapeHtml(opts.description);
  return `    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
${opts.noindex ? '    <meta name="robots" content="noindex" />\n' : ""}    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
${opts.image ? `    <meta property="og:image" content="${escapeHtml(opts.image)}" />\n` : ""}    <meta name="twitter:card" content="${opts.image ? "summary_large_image" : "summary"}" />
    <link rel="icon" type="image/png" href="/images/entelogo-removebg-preview.png" />`;
}

function readerPage(pub: Publication): string {
  const cover = pub.placeholder ? undefined : derivedCoverUrl(pub.slug, 960);
  return `<!doctype html>
<html lang="en">
  <head>
${head({ title: `${pub.title} — ${SITE_NAME}`, description: describe(pub), image: cover })}
  </head>
  <body class="bg-reader-surround" data-publication-slug="${escapeHtml(pub.slug)}">
    <a class="reader-back" href="/${pub.collection === "editions" ? "" : "in-house.html"}">&larr; Back</a>
    <main id="reader-root" class="reader-root"></main>
    <script type="module" src="../reader-entry.ts"></script>
  </body>
</html>
`;
}

function shell(body: string, opts: { title: string; description: string; image?: string; noindex?: boolean; bodyClass?: string }): string {
  return `<!doctype html>
<html lang="en">
  <head>
${head(opts)}
  </head>
  <body class="${opts.bodyClass ?? "bg-cream text-brown"}">
    <site-navbar></site-navbar>
${body}
    <script type="module" src="./site-entry.ts"></script>
  </body>
</html>
`;
}

/** A Publication card. Placeholder Publications render as a non-interactive card, so nothing links to a reader that does not exist. */
function card(pub: Publication): string {
  const cover = derivedCoverUrl(pub.slug, 480);
  const srcset = [480, 960].map((w) => `${derivedCoverUrl(pub.slug, w)} ${w}w`).join(", ");
  const img = `<img class="pub-card-cover" src="${cover}" srcset="${srcset}" sizes="(max-width: 700px) 90vw, 320px" alt="Cover of ${escapeHtml(pub.title)}" width="480" height="640" loading="lazy" decoding="async" />`;

  if (pub.placeholder) {
    return `        <li class="pub-card is-placeholder">
          ${img}
          <h2 class="pub-card-title">${escapeHtml(pub.title)}</h2>
          <p class="pub-card-note">Coming soon</p>
        </li>`;
  }
  return `        <li class="pub-card">
          <a class="pub-card-link" href="/reader/${escapeHtml(pub.slug)}.html">
            ${img}
            <h2 class="pub-card-title">${escapeHtml(pub.title)}</h2>
          </a>
        </li>`;
}

function collectionPage(collection: "editions" | "in-house-books", heading: string, description: string): string {
  const items = publications.filter((p) => p.collection === collection).map(card).join("\n");
  return shell(
    `    <main class="page-main">
      <h1 class="page-heading">${escapeHtml(heading)}</h1>
      <ul class="pub-grid">
${items}
      </ul>
    </main>`,
    { title: collection === "editions" ? SITE_NAME : `${heading} — ${SITE_NAME}`, description }
  );
}

function comingSoonPage(entry: { slug: string; title: string; blurb: string }): string {
  return shell(
    `    <main class="page-main page-main--centered">
      <h1 class="page-heading">${escapeHtml(entry.title)}</h1>
      <p class="page-lede">${escapeHtml(entry.blurb)}</p>
      <p class="page-note">This section is coming soon.</p>
      <p><a class="page-back" href="/">&larr; Back to ${escapeHtml(SITE_NAME)}</a></p>
    </main>`,
    { title: `${entry.title} — ${SITE_NAME}`, description: entry.blurb, noindex: true }
  );
}

function main(): void {
  rmSync(readerPagesDir, { recursive: true, force: true });
  mkdirSync(readerPagesDir, { recursive: true });

  const readable = publications.filter((p) => !p.placeholder);
  for (const pub of readable) {
    writeFileSync(resolve(readerPagesDir, `${pub.slug}.html`), readerPage(pub), "utf8");
  }

  writeFileSync(
    resolve(pagesDir, "index.html"),
    collectionPage("editions", "Editions", `${SITE_NAME} — read every edition of the magazine online in a page-turning reader.`),
    "utf8"
  );
  writeFileSync(
    resolve(pagesDir, "in-house.html"),
    collectionPage("in-house-books", "In-house Books", "Read our in-house books online in a page-turning reader."),
    "utf8"
  );
  for (const entry of COMING_SOON) {
    writeFileSync(resolve(pagesDir, `${entry.slug}.html`), comingSoonPage(entry), "utf8");
  }

  console.log(`[build-pages] generated ${readable.length} reader page(s) into src/pages/reader/`);
  console.log(`[build-pages] generated index.html, in-house.html and ${COMING_SOON.length} coming-soon page(s).`);
  const skipped = publications.length - readable.length;
  if (skipped > 0) {
    console.log(`[build-pages] skipped ${skipped} Placeholder Publication(s) — they have no Pages and cannot be opened.`);
  }
}

main();
