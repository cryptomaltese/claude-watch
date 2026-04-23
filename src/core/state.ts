import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { getConfigDir } from "./config.js";
import { normalizeCwd } from "./slug.js";
import lockfile from "proper-lockfile";

export interface WatchedEntry {
  cwd: string;
  pinnedJsonl: string | null;
  pinnedAt: string;
}

export interface WatchedState {
  version: number;
  entries: WatchedEntry[];
}

function watchedPath(): string { return join(getConfigDir(), "watched.json"); }
function lockPath(): string { return join(getConfigDir(), "state.lock"); }

function ensureLockFile(): void {
  const lp = lockPath();
  mkdirSync(dirname(lp), { recursive: true });
  if (!existsSync(lp)) writeFileSync(lp, "");
}

export function loadState(): WatchedState {
  const p = watchedPath();
  if (!existsSync(p)) return { version: 1, entries: [] };
  try {
    const raw = readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) throw new Error("invalid schema");
    // Auto-heal: normalize cwd on every entry so any pre-existing trailing
    // slashes (e.g., saved by an older buggy fork) are silently corrected
    // in memory. Next saveState flushes the cleaned version to disk.
    const entries = (parsed.entries as WatchedEntry[]).map((e) => ({
      ...e,
      cwd: normalizeCwd(e.cwd),
    }));
    return { version: parsed.version, entries };
  } catch {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    try { renameSync(p, `${p}.broken-${ts}`); } catch {}
    return { version: 1, entries: [] };
  }
}

export function saveState(state: WatchedState): void {
  const p = watchedPath();
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  renameSync(tmp, p);
}

export function addEntry(state: WatchedState, entry: WatchedEntry): WatchedState {
  return { ...state, entries: [...state.entries, entry] };
}

export function removeEntry(state: WatchedState, cwd: string): WatchedState {
  return { ...state, entries: state.entries.filter((e) => e.cwd !== cwd) };
}

export function upsertEntry(state: WatchedState, entry: WatchedEntry): WatchedState {
  const existing = state.entries.findIndex((e) => e.cwd === entry.cwd);
  if (existing >= 0) {
    const entries = [...state.entries];
    entries[existing] = entry;
    return { ...state, entries };
  }
  return addEntry(state, entry);
}

export function rollForward(
  entry: WatchedEntry,
  jsonls: { id: string; mtime: Date }[]
): WatchedEntry {
  if (entry.pinnedJsonl === null) return entry;
  const pinnedAt = new Date(entry.pinnedAt);
  const newer = jsonls
    .filter((j) => j.mtime > pinnedAt)
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  if (newer.length === 0) return entry;
  return { ...entry, pinnedJsonl: newer[0].id, pinnedAt: newer[0].mtime.toISOString() };
}

export async function withStateLock<T>(fn: () => T | Promise<T>): Promise<T> {
  ensureLockFile();
  const lp = lockPath();
  let release: (() => Promise<void>) | undefined;
  try {
    release = await lockfile.lock(lp, { retries: { retries: 5, minTimeout: 100 } });
    return await fn();
  } finally {
    if (release) await release();
  }
}
