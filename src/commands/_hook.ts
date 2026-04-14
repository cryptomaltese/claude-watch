import { homedir } from "node:os";
import { join } from "node:path";
import { sessionStartHook } from "../core/hooks/sessionStart.js";

export function runHook(hookName: string): void {
  if (hookName === "session-start") {
    const claudeHome = process.env.CLAUDE_HOME ?? join(homedir(), ".claude");
    const cwd = process.env.CLAUDE_CWD ?? process.cwd();
    const result = sessionStartHook({ claudeHome, cwd });
    console.log(JSON.stringify(result));
  } else {
    process.stderr.write(`claude-watch: unknown hook '${hookName}'\n`);
    process.exit(1);
  }
}
