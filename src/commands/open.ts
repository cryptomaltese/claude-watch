import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Resolve the claude-watch plugin root directory from the bundled CLI's
 * own location: `<plugin-root>/dist/cli.js` → up one. Used so we can pass
 * `--plugin-dir <plugin-root>` to claude.
 */
function pluginRoot(): string {
  const here = fileURLToPath(import.meta.url);
  return resolve(dirname(here), "..");
}

function tmuxAvailable(): boolean {
  try {
    execFileSync("tmux", ["-V"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function tmuxInstallHint(): string {
  try {
    const os = readFileSync("/etc/os-release", "utf-8");
    if (/ID=(ubuntu|debian)/i.test(os)) return "sudo apt install tmux";
    if (/ID=(fedora|rhel|centos)/i.test(os)) return "sudo dnf install tmux";
    if (/ID=(arch|manjaro)/i.test(os)) return "sudo pacman -S tmux";
    if (/ID=alpine/i.test(os)) return "sudo apk add tmux";
  } catch { /* /etc/os-release not present */ }
  if (process.platform === "darwin") return "brew install tmux";
  return "install tmux via your package manager";
}

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_./-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * One-shot setup: launch a Claude Code session that's ready to use the
 * claude-watch plugin (split-pane /watched, picker, attach, etc.).
 *
 * Three paths:
 *   - Already in tmux: exec `claude --plugin-dir <root>` in the current pane
 *     (no nested tmux sessions, no surprise).
 *   - Not in tmux, tmux available: spawn a new tmux session with claude
 *     inside it. User stays attached.
 *   - Not in tmux, tmux missing: print the install command for the detected
 *     distro and exit.
 *
 * Any extra args are forwarded to claude, so `claude-watch open --resume X`
 * or similar still works.
 */
export async function runOpen(args: string[]): Promise<void> {
  const root = pluginRoot();

  if (process.env.TMUX) {
    const result = spawnSync("claude", ["--plugin-dir", root, ...args], {
      stdio: "inherit",
    });
    process.exit(result.status ?? 0);
  }

  if (!tmuxAvailable()) {
    process.stdout.write(
      "✗ tmux isn't installed. claude-watch needs tmux for session\n" +
      "  persistence and the split-pane picker.\n\n" +
      `  Install: ${tmuxInstallHint()}\n\n` +
      "  Then re-run: claude-watch open\n"
    );
    process.exit(1);
  }

  const claudeCmd = ["claude", "--plugin-dir", root, ...args].map(shellQuote).join(" ");
  const sessionName = `cw-open-${process.pid}`;
  const result = spawnSync(
    "tmux",
    ["new-session", "-A", "-s", sessionName, claudeCmd],
    { stdio: "inherit" }
  );
  process.exit(result.status ?? 0);
}
