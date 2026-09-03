/**
 * Resume-on-reopen (requirement 6) and the global page-turn-sound
 * preference (requirement 8). Both are just namespaced localStorage reads/
 * writes through storage.ts's safe wrapper — this module owns the key
 * scheme and the parsing/validation, so nothing else in the reader touches
 * raw storage keys.
 */

import { readStorage, writeStorage } from "./storage";

/** Bump this if the persisted shape ever changes incompatibly. */
const NAMESPACE = "entesalabhanjika:reader:v1";

function resumeKey(publicationSlug: string): string {
  return `${NAMESPACE}:resume:${publicationSlug}`;
}

const SOUND_KEY = `${NAMESPACE}:sound-enabled`;

/**
 * Last page the visitor had open for this Publication (CONTEXT.md §
 * Publication — keyed by slug), or null if there is none stored yet or the
 * stored value doesn't parse as a positive integer.
 */
export function getResumePage(publicationSlug: string): number | null {
  const raw = readStorage(resumeKey(publicationSlug));
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function setResumePage(publicationSlug: string, pageNumber: number): void {
  writeStorage(resumeKey(publicationSlug), String(pageNumber));
}

/** Page-turn sound defaults OFF (requirement 8) until the visitor opts in. */
export function getSoundEnabled(): boolean {
  return readStorage(SOUND_KEY) === "1";
}

export function setSoundEnabled(enabled: boolean): void {
  writeStorage(SOUND_KEY, enabled ? "1" : "0");
}
