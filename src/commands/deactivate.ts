import { resolve } from "node:path";
import { deactivate } from "../core/actions.js";

export async function runDeactivate(args: string[]): Promise<void> {
  const cwdArg = args[0];
  if (!cwdArg) {
    process.stderr.write("Usage: claude-watch deactivate <directory> [--no-kill]\n");
    process.exit(1);
  }
  const cwd = resolve(cwdArg);
  const noKill = args.includes("--no-kill");
  await deactivate({ cwd, kill: !noKill });
  console.log(`Deactivated ${cwd}${noKill ? " (tmux preserved)" : ""}`);
}
