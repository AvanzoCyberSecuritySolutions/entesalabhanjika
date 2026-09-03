/**
 * Safe localStorage wrapper. Private/incognito mode, storage quotas, and
 * some embedded webviews all make `localStorage.setItem`/`getItem` throw
 * (Safari private mode throws on the very first write) — every reader
 * module that wants to persist something (progress.ts's resume position,
 * sound.ts's mute toggle) goes through here instead of touching
 * `window.localStorage` directly, so "storage unavailable" is handled once.
 *
 * Falls back to an in-memory Map for the lifetime of the page when real
 * storage isn't usable, so callers never need their own try/catch and the
 * reader degrades to "doesn't remember across visits" instead of crashing.
 */

const memoryFallback = new Map<string, string>();

/** Probed once, lazily, on first use — not at module load, so importing this file has no side effects. */
let realStorageUsable: boolean | undefined;

function probe(): boolean {
  if (realStorageUsable !== undefined) return realStorageUsable;
  try {
    const probeKey = "__entesalabhanjika_reader_probe__";
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
    realStorageUsable = true;
  } catch {
    realStorageUsable = false;
  }
  return realStorageUsable;
}

export function readStorage(key: string): string | null {
  if (probe()) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      // Fall through to the memory fallback below — a mid-session failure
      // (e.g. quota exceeded elsewhere) shouldn't surface to the caller.
    }
  }
  return memoryFallback.get(key) ?? null;
}

export function writeStorage(key: string, value: string): void {
  if (probe()) {
    try {
      window.localStorage.setItem(key, value);
      return;
    } catch {
      // Fall through — keep the value at least for this tab's lifetime.
    }
  }
  memoryFallback.set(key, value);
}
