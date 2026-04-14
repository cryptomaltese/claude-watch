import { resolve } from "node:path";
import { createNew } from "../core/actions.js";

export async function runNew(args: string[]): Promise<void> {
  const cwdArg = args[0];
  if (!cwdArg) {
    process.stderr.write("Usage: claude-watch new <directory>\n");
    process.exit(1);
  }
  const cwd = resolve(cwdArg);
  await createNew({ cwd });
  console.log(`Created new watched session at ${cwd}`);
}
