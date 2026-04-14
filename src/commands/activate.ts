import { resolve } from "node:path";
import { activate } from "../core/actions.js";
import { loadSessions } from "../core/sessions.js";
import { pathToSlug } from "../core/slug.js";

export async function runActivate(args: string[]): Promise<void> {
  const cwdArg = args[0];
  if (!cwdArg) {
    process.stderr.write("Usage: claude-watch activate <directory> [--jsonl <id>]\n");
    process.exit(1);
  }
  const cwd = resolve(cwdArg);
  const jsonlIdx = args.indexOf("--jsonl");
  let jsonlId: string;

  if (jsonlIdx >= 0 && args[jsonlIdx + 1]) {
    jsonlId = args[jsonlIdx + 1];
  } else {
    const sessions = await loadSessions();
    const slug = pathToSlug(cwd);
    const match = sessions.find((s) => s.slug === slug);
    if (!match) {
      process.stderr.write(`No session found for ${cwd}. Use 'claude-watch new' for a fresh session.\n`);
      process.exit(1);
    }
    jsonlId = match.jsonlId;
  }

  await activate({ cwd, jsonlId });
  console.log(`Activated ${cwd} (pinned ${jsonlId.slice(0, 8)}...)`);
}
