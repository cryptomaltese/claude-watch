import { resolve } from "node:path";
import { refresh } from "../core/actions.js";
import { loadState } from "../core/state.js";
import { normalizeCwd, cwdToTmuxName } from "../core/slug.js";

export async function runRefresh(args: string[]): Promise<void> {
  const cwdArg = args[0];
  if (!cwdArg) {
    process.stderr.write("Usage: claude-watch refresh <directory>\n");
    process.exit(1);
  }
  const cwd = normalizeCwd(resolve(cwdArg));

  // Refresh requires the cwd to be watched — that's the only case where we
  // know which jsonl to resume from (the pinned one). Unwatched refresh
  // isn't meaningful: if you wanted to restart an unwatched session, you'd
  // use `activate` to adopt + spawn.
  const state = loadState();
  const entry = state.entries.find((e) => e.cwd === cwd);
  if (!entry) {
    process.stderr.write(`Not watched: ${cwd}. Use 'claude-watch activate' first.\n`);
    process.exit(1);
  }

  await refresh({ cwd, jsonlId: entry.pinnedJsonl });
  const label = entry.pinnedJsonl
    ? `resumed ${entry.pinnedJsonl.slice(0, 8)}...`
    : "spawned fresh (brand-new session)";
  console.log(`Refreshed ${cwd} — ${label} as ${cwdToTmuxName(cwd)}`);
}
