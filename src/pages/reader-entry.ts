/**
 * Shared entry for every generated reader page.
 *
 * One entry serves all Publications: the generated HTML carries the slug on
 * `<body data-publication-slug>`, and this looks the Publication up in the
 * manifest. Adding a Publication therefore means adding a manifest entry —
 * never writing a page or an entry script (CONTEXT.md § Publication).
 */
import { publications } from "../../content/publications";
import { DerivedImagePageSource } from "../page-sources";
import { Reader } from "../components/reader/reader";
import "../styles/tailwind.css";

function fail(message: string): never {
  const container = document.querySelector("#reader-root");
  if (container) {
    container.textContent = message;
    container.setAttribute("role", "alert");
  }
  throw new Error(`reader-entry: ${message}`);
}

async function main(): Promise<void> {
  const container = document.querySelector<HTMLElement>("#reader-root");
  if (!container) fail("Reader container #reader-root is missing from the page.");

  const slug = document.body.dataset.publicationSlug;
  if (!slug) fail("Page is missing data-publication-slug on <body>.");

  const publication = publications.find((p) => p.slug === slug);
  if (!publication) fail(`No Publication named "${slug}" exists in the manifest.`);

  // Placeholder Publications carry no pages by construction, so they get no
  // reader page generated and should never reach this entry.
  if (publication.placeholder) fail(`"${slug}" is a Placeholder Publication and cannot be opened.`);

  const reader = new Reader({
    container,
    pageSource: new DerivedImagePageSource({ slug: publication.slug, kind: publication.pageSourceKind }),
    publicationSlug: publication.slug,
    publicationTitle: publication.title,
  });

  await reader.mount();
}

void main();
