import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { defineConfig } from "vite";

import { publications } from "./content/publications";
import type { Publication } from "./content/publication";

const rootDir = dirname(fileURLToPath(import.meta.url));
const pagesDir = resolve(rootDir, "src/pages");

/**
 * Fixed MPA entries that exist regardless of manifest contents — the shell
 * pages for each Collection (CONTEXT.md § Collection), keyed by the name
 * Rollup should use for the emitted chunk/output.
 */
const FIXED_ENTRIES: Record<string, string> = {
  main: "index.html",
  "in-house": "in-house.html",
};

/**
 * Convention for where a readable Publication's own reader entry page
 * lives on disk, given its slug. Kept as a single function so the
 * convention only has to change in one place if a later node picks a
 * different layout.
 */
function readerEntryPath(slug: string): string {
  return resolve(pagesDir, "reader", `${slug}.html`);
}

/**
 * Derive the Rollup `input` map for the MPA build from the Publication
 * manifest (content/publications.ts), instead of hand-listing every page
 * the way the legacy site hand-duplicates edition1.html..edition5.html.
 *
 * - Fixed shell entries (FIXED_ENTRIES) are always included, if present on
 *   disk — this keeps `vite build` working before any page has been
 *   migrated into src/pages/, and lets `npm run build` succeed against the
 *   current empty/stub manifest.
 * - One additional entry is added per ReadablePublication in `pubs`, at
 *   the conventional path from readerEntryPath(). Placeholder Publications
 *   (CONTEXT.md § Placeholder Publication) never get a build entry — they
 *   have no Pages to read, so there is nothing for a reader page to render.
 * - A manifest entry whose conventional file does not exist yet on disk is
 *   skipped with a warning rather than failing the build, so populating
 *   content/publications.ts and adding the matching src/pages/reader/*.html
 *   file can happen as two separate, independently-landable steps.
 *
 * Exported so this logic is unit-testable and so it is obvious to a later
 * node exactly how to add a new Publication's page to the build.
 */
export function resolveEntries(pubs: readonly Publication[] = publications): Record<string, string> {
  const entries: Record<string, string> = {};

  for (const [name, relPath] of Object.entries(FIXED_ENTRIES)) {
    const abs = resolve(pagesDir, relPath);
    if (existsSync(abs)) {
      entries[name] = abs;
    } else {
      console.warn(`[vite.config] fixed entry "${name}" expected at ${abs} but it does not exist — skipping.`);
    }
  }

  for (const pub of pubs) {
    if (pub.placeholder) continue;
    const abs = readerEntryPath(pub.slug);
    if (existsSync(abs)) {
      entries[pub.slug] = abs;
    } else {
      console.warn(
        `[vite.config] Publication "${pub.slug}" has no reader entry at ${abs} yet — skipping until the page is added.`
      );
    }
  }

  if (Object.keys(entries).length === 0) {
    throw new Error(
      "[vite.config] resolveEntries() produced zero Rollup inputs — at least one fixed entry under src/pages/ must exist."
    );
  }

  return entries;
}

export default defineConfig({
  // Vite's HTML entries emit to dist mirroring their path *relative to
  // root*. Rooting at src/pages/ (rather than the project root) is what
  // makes the "main" entry land at dist/index.html instead of
  // dist/src/pages/index.html — i.e. the site's actual public URL
  // structure. publicDir and build.outDir are pinned back to absolute,
  // project-root-relative paths below since Vite would otherwise resolve
  // both of those relative to the new `root` too.
  root: pagesDir,
  publicDir: resolve(rootDir, "public"),
  build: {
    outDir: resolve(rootDir, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolveEntries(),
    },
  },
});
