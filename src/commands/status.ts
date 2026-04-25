import { basename } from "node:path";
import { loadEnrichedSessions } from "../core/sessions.js";
import { loadState } from "../core/state.js";
import { getTmuxDriver } from "../core/tmux.js";
import { findTmuxForCwd } from "../core/actions.js";

interface Flags {
  json: boolean;
}

function parseFlags(args: string[]): Flags {
  return { json: args.includes("--json") };
}

export async function runStatus(args: string[]): Promise<void> {
  const flags = parseFlags(args);

  if (flags.json) {
    const sessions = await loadEnrichedSessions();
    const envelope = {
      sessions: sessions.map((s) => ({
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
      totalCount: sessions.length,
    };
    console.log(JSON.stringify(envelope, null, 2));
    return;
  }

  // Human-readable: watched entries only, table format.
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
