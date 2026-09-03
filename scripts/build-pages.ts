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
const readerPagesDir = resolve(projectRoot, "src/pages/reader");

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

function main(): void {
  rmSync(readerPagesDir, { recursive: true, force: true });
  mkdirSync(readerPagesDir, { recursive: true });

  const readable = publications.filter((p) => !p.placeholder);
  for (const pub of readable) {
    writeFileSync(resolve(readerPagesDir, `${pub.slug}.html`), readerPage(pub), "utf8");
  }

  console.log(`[build-pages] generated ${readable.length} reader page(s) into src/pages/reader/`);
  const skipped = publications.length - readable.length;
  if (skipped > 0) {
    console.log(`[build-pages] skipped ${skipped} Placeholder Publication(s) — they have no Pages and cannot be opened.`);
  }
}

main();
