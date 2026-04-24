import { basename } from "node:path";
import { loadEnrichedSessions, type EnrichedSession } from "../core/sessions.js";
import { loadState } from "../core/state.js";
import { getTmuxDriver } from "../core/tmux.js";
import { findTmuxForCwd } from "../core/actions.js";
import { loadConfig } from "../core/config.js";

interface Flags {
  json: boolean;
  search: string | null;
  page: number | null;
}

function parseFlags(args: string[]): Flags {
  const flags: Flags = { json: false, search: null, page: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") flags.json = true;
    else if (a === "--search" || a === "-s") flags.search = args[++i] ?? "";
    else if (a === "--page") flags.page = Number(args[++i]) || 1;
  }
  return flags;
}

function matchesSearch(s: EnrichedSession, q: string): boolean {
  const needle = q.toLowerCase();
  const haystack = [
    s.cwd ?? "",
    s.cwd ? basename(s.cwd) : "",
    s.lastEvent,
  ].join(" ").toLowerCase();
  return haystack.includes(needle);
}

export async function runStatus(args: string[]): Promise<void> {
  const flags = parseFlags(args);

  if (flags.json) {
    const config = loadConfig();
    let sessions = await loadEnrichedSessions();
    if (flags.search) sessions = sessions.filter((s) => matchesSearch(s, flags.search!));

    const pageSize = config.pageSize;
    const totalPages = Math.max(1, Math.ceil(sessions.length / pageSize));
    const current = flags.page !== null ? Math.min(Math.max(1, flags.page), totalPages) : 1;
    const pagedSessions = flags.page !== null
      ? sessions.slice((current - 1) * pageSize, current * pageSize)
      : sessions;

    const envelope = {
      sessions: pagedSessions.map((s) => ({
        cwd: s.cwd,
        jsonlId: s.jsonlId,
        jsonlPath: s.jsonlPath,
        name: s.cwd ? basename(s.cwd) : s.slug,
        slug: s.slug,
        isWatched: s.isWatched,
        isAlive: s.isAlive,
        brandNew: s.brandNew,
        mtime: s.mtime.toISOString(),
        lastEvent: s.lastEvent,
      })),
      page: { current, total: totalPages },
      totalCount: sessions.length,
    };
    console.log(JSON.stringify(envelope, null, 2));
    return;
  }

  // Human-readable path — unchanged from the original, just watched entries.
  const state = loadState();
  const driver = getTmuxDriver();

  if (state.entries.length === 0) {
    console.log("No watched sessions.");
    return;
  }

  console.log(
    `${"SESSION".padEnd(20)} ${"STATUS".padEnd(10)} ${"PINNED".padEnd(14)} DIRECTORY`
  );
  console.log(
    `${"-------".padEnd(20)} ${"------".padEnd(10)} ${"------".padEnd(14)} ---------`
  );

  for (const entry of state.entries) {
    const tmuxName = findTmuxForCwd(driver, entry.cwd);
    const alive = tmuxName !== null;
    const status = alive ? "ALIVE" : "DEAD";
    const pinned = entry.pinnedJsonl ? entry.pinnedJsonl.slice(0, 8) + "..." : "(new)";
    console.log(
      `${basename(entry.cwd).padEnd(20)} ${status.padEnd(10)} ${pinned.padEnd(14)} ${entry.cwd}`
    );
  }
}
