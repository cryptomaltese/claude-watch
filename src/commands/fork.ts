import { resolve } from "node:path";
import { fork } from "../core/actions.js";
import { loadSessions } from "../core/sessions.js";
import { loadState } from "../core/state.js";
import { normalizeCwd, pathToSlug, cwdToTmuxName } from "../core/slug.js";

/**
 * Fork a session into a new cwd.
 *
 * Usage:
 *   claude-watch fork <src-cwd> <target-cwd>
 *
 * Resolves the source jsonl:
 *   - If src-cwd is watched: use the pinned jsonl.
 *   - Otherwise: use the newest jsonl in src-cwd's project dir.
 * Refuses if src-cwd is watched brand-new (no jsonl to fork from) or if
 * no jsonl exists at all.
 */
export async function runFork(args: string[]): Promise<void> {
  const srcArg = args[0];
  const targetArg = args[1];
  if (!srcArg || !targetArg) {
    process.stderr.write("Usage: claude-watch fork <src-cwd> <target-cwd>\n");
    process.exit(1);
  }
  const srcCwd = normalizeCwd(resolve(srcArg));
  const targetCwd = normalizeCwd(resolve(targetArg));

  // Resolve source jsonl: prefer pinned (watched) over newest-on-disk
  const state = loadState();
  const watchedEntry = state.entries.find((e) => e.cwd === srcCwd);

  let srcJsonlId: string | null = watchedEntry?.pinnedJsonl ?? null;

  if (!srcJsonlId) {
    const sessions = await loadSessions();
    const srcSlug = pathToSlug(srcCwd);
    const match = sessions.find((s) => s.slug === srcSlug);
    if (!match) {
      process.stderr.write(
        `No jsonl found for source ${srcCwd} — nothing to fork from.\n`
      );
      process.exit(1);
    }
    srcJsonlId = match.jsonlId;
  }

  // Resolve srcJsonlPath from the id
  const sessions = await loadSessions();
  const srcSession = sessions.find((s) => s.jsonlId === srcJsonlId);
  if (!srcSession) {
    process.stderr.write(`Source jsonl ${srcJsonlId} not found on disk.\n`);
    process.exit(1);
  }

  await fork({
    cwd: targetCwd,
    srcJsonlPath: srcSession.jsonlPath,
    srcJsonlId,
  });
  console.log(
    `Forked ${srcCwd} → ${targetCwd} (from ${srcJsonlId.slice(0, 8)}...) as ${cwdToTmuxName(targetCwd)}`
  );
}
