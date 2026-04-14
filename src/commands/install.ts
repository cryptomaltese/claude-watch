import { execFileSync, execSync } from "node:child_process";
import { copyFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { getConfigDir } from "../core/config.js";
import { log } from "../core/log.js";

function getPluginDir(): string {
  return resolve(dirname(dirname(new URL(import.meta.url).pathname)));
}

export function runInstall(): void {
  const configDir = getConfigDir();
  const pluginDir = getPluginDir();

  const stableBin = join(configDir, "bin");
  const stableDist = join(configDir, "dist");
  mkdirSync(stableBin, { recursive: true });
  mkdirSync(stableDist, { recursive: true });

  const srcWrapper = join(pluginDir, "bin", "claude-watch");
  const srcBundle = join(pluginDir, "dist", "cli.js");
  const destWrapper = join(stableBin, "claude-watch");
  const destBundle = join(stableDist, "cli.js");

  if (existsSync(srcWrapper)) {
    copyFileSync(srcWrapper, destWrapper);
    chmodSync(destWrapper, 0o755);
  }
  if (existsSync(srcBundle)) {
    copyFileSync(srcBundle, destBundle);
  }

  const cronLine = `*/5 * * * * '${destWrapper}' scan >> '${join(configDir, "claude-watch.log")}' 2>&1`;

  try {
    let existing = "";
    try { existing = execFileSync("crontab", ["-l"], { encoding: "utf-8" }); } catch {}
    const filtered = existing.split("\n").filter((line) => !line.includes("claude-watch")).join("\n");
    const newCrontab = (filtered.trim() + "\n" + cronLine + "\n").trim() + "\n";
    execSync(`echo '${newCrontab.replace(/'/g, "'\\''")}' | crontab -`);

    console.log("Installed claude-watch:");
    console.log(`  Stable binary: ${destWrapper}`);
    console.log(`  Cron: every 5 minutes`);
    console.log(`  Log: ${join(configDir, "claude-watch.log")}`);
    log("info", "install complete");
  } catch (err) {
    process.stderr.write(`Failed to install cron entry: ${err}\n`);
    process.exit(1);
  }
}
