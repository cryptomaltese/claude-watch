import { execFileSync } from "node:child_process";
import { getConfigDir } from "../core/config.js";
import { log } from "../core/log.js";

export function runUninstall(): void {
  try {
    let existing = "";
    try { existing = execFileSync("crontab", ["-l"], { encoding: "utf-8" }); } catch {
      console.log("No crontab found — nothing to uninstall.");
      return;
    }
    if (!existing.includes("claude-watch")) {
      console.log("No claude-watch cron entry found.");
      return;
    }
    const filtered = existing.split("\n").filter((line) => !line.includes("claude-watch")).join("\n").trim() + "\n";
    execFileSync("crontab", ["-"], { input: filtered, stdio: ["pipe", "inherit", "inherit"] });
    console.log("Removed claude-watch cron entry.");
    console.log(`Config and state preserved at ${getConfigDir()}`);
    log("info", "uninstall complete");
  } catch (err) {
    process.stderr.write(`Failed to uninstall: ${err}\n`);
    process.exit(1);
  }
}
