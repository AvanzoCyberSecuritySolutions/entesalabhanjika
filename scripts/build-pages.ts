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
import { ICON_ARROW_LEFT } from "../src/components/reader/icons";

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
    <link rel="icon" type="image/webp" href="/images/logo.webp" />`;
}

function readerPage(pub: Publication): string {
  const cover = pub.placeholder ? undefined : derivedCoverUrl(pub.slug, 960);
  return `<!doctype html>
<html lang="en">
  <head>
${head({ title: `${pub.title} — ${SITE_NAME}`, description: describe(pub), image: cover })}
  </head>
  <body class="bg-tan" data-publication-slug="${escapeHtml(pub.slug)}">
    <a class="reader-back" href="/${pub.collection === "editions" ? "" : "in-house.html"}">${ICON_ARROW_LEFT}<span>Back</span></a>
    <main id="reader-root" class="reader-root"></main>
    <script type="module" src="../reader-entry.ts"></script>
  </body>
</html>
`;
}

/**
 * The line-art dancer illustration, positioned per-page to match the
 * pages it originally decorated (home got three copies incl. the large
 * centre one, in-house got one). Purely decorative — aria-hidden, behind
 * everything (z-0), never intercepts a click (pointer-events-none).
 */
function decor(variant: "home" | "library"): string {
  if (variant === "library") {
    return `    <img src="/images/img1.webp" alt="" aria-hidden="true" loading="lazy" class="absolute top-0 left-0 w-[450px] opacity-20 z-0 pointer-events-none" />`;
  }
  return `    <img src="/images/img1.webp" alt="" aria-hidden="true" loading="lazy" class="absolute top-0 left-0 w-[450px] opacity-20 z-0 pointer-events-none" />
    <img src="/images/img3.png" alt="" aria-hidden="true" loading="lazy" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] opacity-25 z-0 pointer-events-none hidden md:block" />
    <img src="/images/img1.webp" alt="" aria-hidden="true" loading="lazy" class="absolute top-24 right-0 w-[350px] opacity-20 -scale-x-100 z-0 pointer-events-none hidden md:block" />`;
}

function shell(body: string, opts: { title: string; description: string; image?: string; noindex?: boolean; bodyClass?: string; decor?: "home" | "library"; extraScript?: string }): string {
  return `<!doctype html>
<html lang="en">
  <head>
${head(opts)}
  </head>
  <body class="relative overflow-x-hidden ${opts.bodyClass ?? "bg-cream text-brown"}">
    <site-navbar></site-navbar>
${opts.decor ? decor(opts.decor) + "\n" : ""}${body}
    <script type="module" src="./site-entry.ts"></script>
${opts.extraScript ? `    <script type="module" src="${opts.extraScript}"></script>\n` : ""}  </body>
</html>
`;
}

/** A Publication card. Placeholder Publications render as a non-interactive card, so nothing links to a reader that does not exist. */
function card(pub: Publication): string {
  const cover = derivedCoverUrl(pub.slug, 480);
  const srcset = [480, 960].map((w) => `${derivedCoverUrl(pub.slug, w)} ${w}w`).join(", ");
  const img = `<img class="pub-card-cover" src="${cover}" srcset="${srcset}" sizes="(max-width: 700px) 90vw, 320px" alt="Cover of ${escapeHtml(pub.title)}" width="480" height="640" loading="lazy" decoding="async" />`;

  const search = escapeHtml(pub.title.toLowerCase());

  if (pub.placeholder) {
    return `        <li class="pub-card is-placeholder" data-search="${search}">
          ${img}
          <h2 class="pub-card-title">${escapeHtml(pub.title)}</h2>
          <p class="pub-card-note">Coming soon</p>
        </li>`;
  }
  return `        <li class="pub-card" data-search="${search}">
          <a class="pub-card-link" href="/reader/${escapeHtml(pub.slug)}.html">
            ${img}
            <h2 class="pub-card-title">${escapeHtml(pub.title)}</h2>
          </a>
        </li>`;
}

/**
 * The search capsule shared by the home and in-house pages (search.ts
 * wires it up client-side by title match; there is nothing to search
 * inside — Pages are scanned images, not text). `marginTopClass` lets each
 * caller place it against whatever sits above it: the home page has only
 * the navbar above, the in-house page already has page-main's own top
 * padding plus a heading.
 */
function searchBar(marginTopClass: string): string {
  return `      <div class="${marginTopClass} flex justify-center px-4 relative z-40">
        <div class="flex items-center w-full max-w-[800px] bg-tan rounded-full px-6 py-4 shadow-lg">
          <img src="/images/search.png" alt="" aria-hidden="true" class="w-6 h-6 mr-3" />
          <input type="text" placeholder="Search" class="page-search-input flex-grow bg-tan outline-none text-brown text-base md:text-lg px-3 placeholder:text-[#727272]" />
          <img src="/images/mi_filter.png" alt="" aria-hidden="true" class="w-6 h-6 ml-3 cursor-pointer" />
        </div>
      </div>`;
}

function collectionPage(collection: "in-house-books", heading: string, description: string): string {
  const items = publications.filter((p) => p.collection === collection).map(card).join("\n");
  return shell(
    `    <main class="page-main">
      <h1 class="page-heading">${escapeHtml(heading)}</h1>
${searchBar("mb-8")}
      <ul class="pub-grid">
${items}
      </ul>
      <p class="search-empty-note" hidden>No matches found.</p>
    </main>`,
    { title: `${heading} — ${SITE_NAME}`, description, decor: "library" }
  );
}

/**
 * One slide in the home carousel: a blob-mask cutout of the shared cover
 * photo with the Publication's title stamped over it. A Placeholder
 * Publication renders the same shape so the shelf still reads as five
 * editions, but as a <div> (not a link) with a "Coming soon" note — the
 * old site's div+data-link click handler pointed at pages that could not
 * exist yet; a real <a href> only goes where there is something to read.
 */
function editionSlide(pub: Publication): string {
  const mask = `-webkit-mask-image: url('/images/Vector.png'); mask-image: url('/images/Vector.png'); -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: center; mask-position: center; -webkit-mask-size: contain; mask-size: contain;`;
  const inner = `        <img src="/images/edition.jpg" alt="" aria-hidden="true" class="w-full h-full object-cover z-10" style="${mask}" />
        <div class="absolute inset-0 z-20 pointer-events-none overlay" style="${mask}"></div>
        <h2 class="absolute inset-0 flex items-center justify-center text-[clamp(1rem,10cqi,6rem)] font-bold z-30 edition-text text-white whitespace-nowrap">${escapeHtml(pub.title.toUpperCase())}</h2>${
    pub.placeholder
      ? // A plain white label here sat right at the blob mask's bottom
        // point, past the opaque photo, over the plain cream page
        // background — invisible. A solid pill reads regardless of
        // what's behind it (photo or page background).
        `\n        <p class="absolute bottom-[6%] inset-x-0 z-30 flex justify-center pointer-events-none"><span class="bg-brown/90 text-cream text-xs sm:text-sm italic px-3 py-1 rounded-full">Coming soon</span></p>`
      : ""
  }`;

  const search = escapeHtml(pub.title.toLowerCase());

  if (pub.placeholder) {
    return `      <div class="relative flex justify-center mb-8 lg:mb-0 vector-slide" data-search="${search}">
${inner}
      </div>`;
  }
  return `      <a class="relative flex justify-center mb-8 lg:mb-0 vector-slide" href="/reader/${escapeHtml(pub.slug)}.html" aria-label="Open ${escapeHtml(pub.title)}" data-search="${search}">
${inner}
      </a>`;
}

function homePage(): string {
  const editions = publications.filter((p) => p.collection === "editions");
  return shell(
    `${searchBar("mt-[clamp(120px,20dvh,220px)]")}
    <section class="relative mt-[clamp(2rem,5dvh,5rem)] z-50 pb-[clamp(2rem,8dvh,8rem)]">
      <div class="scroller">
${editions.map(editionSlide).join("\n")}
      </div>
      <p class="search-empty-note" hidden>No matches found.</p>
    </section>`,
    {
      title: SITE_NAME,
      description: `${SITE_NAME} — read every edition of the magazine online in a page-turning reader.`,
      decor: "home",
      extraScript: "./home-entry.ts",
    }
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
    { title: `${entry.title} — ${SITE_NAME}`, description: entry.blurb, noindex: true, decor: "library" }
  );
}

function main(): void {
  rmSync(readerPagesDir, { recursive: true, force: true });
  mkdirSync(readerPagesDir, { recursive: true });

  const readable = publications.filter((p) => !p.placeholder);
  for (const pub of readable) {
    writeFileSync(resolve(readerPagesDir, `${pub.slug}.html`), readerPage(pub), "utf8");
  }

  writeFileSync(resolve(pagesDir, "index.html"), homePage(), "utf8");
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
