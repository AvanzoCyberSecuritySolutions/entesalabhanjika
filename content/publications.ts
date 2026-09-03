/**
 * The Publication manifest — single source of truth for every Edition and
 * Book on the site.
 *
 * Currently a stub: N1 (this node) defines the Publication contract only;
 * a later node populates real entries here (5 editions, 3 in-house books —
 * see CONTEXT.md). Both `vite.config.ts` (to derive its MPA rollup entries)
 * and `scripts/build-assets.ts` (to know which sources to convert) import
 * this array, so populating it is what wires a new Publication into the
 * build and the site without editing either of those files by hand.
 */

import type { Publication } from "./publication";

export const publications: Publication[] = [];
