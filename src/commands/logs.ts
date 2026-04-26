import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../core/config.js";

export function runLogs(args: string[]): void {
  const count = parseInt(args[0] ?? "50", 10);
  const logPath = join(getConfigDir(), "claude-watch.log");
  if (!existsSync(logPath)) {
    console.log(`No log file found at ${logPath}`);
    return;
  }
  const content = readFileSync(logPath, "utf-8");
  const lines = content.trim().split("\n");
  console.log(lines.slice(-count).join("\n"));
}
