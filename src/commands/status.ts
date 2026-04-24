import { basename } from "node:path";
import { loadEnrichedSessions, type EnrichedSession } from "../core/sessions.js";
import { loadState } from "../core/state.js";
import { getTmuxDriver } from "../core/tmux.js";
import { findTmuxForCwd } from "../core/actions.js";
import { loadConfig } from "../core/config.js";

interface Flags {
  json: boolean;
  list: boolean;
  search: string | null;
  page: number | null;
}

function parseFlags(args: string[]): Flags {
  const flags: Flags = { json: false, list: false, search: null, page: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") flags.json = true;
    else if (a === "--list") flags.list = true;
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

function ageString(mtime: Date): string {
  const ms = Date.now() - mtime.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

function stateTag(s: EnrichedSession): string {
  if (s.brandNew) return s.isAlive ? "new alive" : "new dead";
  if (s.isWatched && s.isAlive) return "watched alive";
  if (s.isWatched && !s.isAlive) return "watched dead";
  if (!s.isWatched && s.isAlive) return "unwatched alive";
  return "unwatched dead";
}

function truncate(s: string, max = 80): string {
  const collapsed = s.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? collapsed.slice(0, max) + "…" : collapsed;
}

export async function runStatus(args: string[]): Promise<void> {
  const flags = parseFlags(args);

  if (flags.json || flags.list) {
    const config = loadConfig();
    let sessions = await loadEnrichedSessions();
    if (flags.search) sessions = sessions.filter((s) => matchesSearch(s, flags.search!));

    const pageSize = config.pageSize;
    const totalPages = Math.max(1, Math.ceil(sessions.length / pageSize));
    const current = Math.min(Math.max(1, flags.page ?? 1), totalPages);
    const paged = flags.page !== null || flags.list
      ? sessions.slice((current - 1) * pageSize, current * pageSize)
      : sessions;

    if (flags.json) {
      const envelope = {
        sessions: paged.map((s) => ({
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

    // --list: human- and LLM-friendly pre-formatted output. Slash commands
    // shell out to this and print it verbatim — no jq transformations, no
    // Claude-side reformatting. Each row embeds enough metadata (state tag,
    // jsonl id prefix) that a follow-up call isn't needed for action choice.
    const currentCwd = process.cwd();
    const startIdx = (current - 1) * pageSize + 1;
    const endIdx = startIdx + paged.length - 1;
    const header = sessions.length === 0
      ? "No sessions found."
      : totalPages > 1
        ? `claude-watch sessions (${sessions.length} total, showing ${startIdx}-${endIdx} — page ${current}/${totalPages}):`
        : `claude-watch sessions (${sessions.length} total):`;
    console.log(header);
    console.log();

    paged.forEach((s, i) => {
      const n = startIdx + i;
      const name = s.cwd ? basename(s.cwd) : s.slug || "(unknown)";
      const thisSession = s.cwd === currentCwd ? " (this session)" : "";
      const jsonlTag = s.jsonlId ? ` · jsonl:${s.jsonlId.slice(0, 8)}` : "";
      console.log(`${n}. [${stateTag(s)}] ${name}${thisSession}${jsonlTag}`);
      console.log(`   ${ageString(s.mtime)} · ${s.cwd ?? "(no cwd)"}`);
      if (s.lastEvent) console.log(`   "${truncate(s.lastEvent)}"`);
      console.log();
    });

    if (totalPages > 1) {
      const hints: string[] = ["number"];
      if (current < totalPages) hints.push('"n" next');
      if (current > 1) hints.push('"p" prev');
      console.log(`Type: ${hints.join(" · ")}`);
    } else if (sessions.length > 0) {
      console.log("Type a number.");
    }
    return;
  }

  // Legacy human-readable path — watched entries only, table format.
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
