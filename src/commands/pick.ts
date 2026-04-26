import React from "react";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { render } from "ink";
import { App } from "../picker/App.js";

/**
 * Walk the process tree looking for `TMUX` in any ancestor's env.
 *
 * Claude Code's Bash tool scrubs `TMUX` from the subprocess env (verified
 * 2026-04-26 — \`/watched\` slash command got "Not inside tmux" even when
 * the user's pane was clearly inside a tmux session). The parent claude
 * process itself still has TMUX since the user launched it from a tmux
 * shell — read it from `/proc/<ppid>/environ` and pass through.
 *
 * Linux-only. Returns null on macOS or if /proc is unreadable.
 */
function recoverTmuxEnv(): string | null {
  if (process.env.TMUX) return process.env.TMUX;
  try {
    let pid = process.ppid;
    for (let i = 0; i < 30 && pid > 1; i++) {
      const environ = readFileSync(`/proc/${pid}/environ`, "utf-8");
      const found = environ.split("\0").find((s) => s.startsWith("TMUX="));
      if (found) return found.slice("TMUX=".length);
      const status = readFileSync(`/proc/${pid}/status`, "utf-8");
      const m = status.match(/^PPid:\s+(\d+)$/m);
      if (!m) break;
      pid = parseInt(m[1], 10);
    }
  } catch { /* /proc not available or insufficient perms */ }
  return null;
}

function getTmuxPrefixKey(env: NodeJS.ProcessEnv): string {
  try {
    const out = execFileSync("tmux", ["show-options", "-g", "prefix"], {
      encoding: "utf-8",
      env,
    });
    // out is e.g. "prefix C-b\n" — translate to a human-readable chord
    const match = out.match(/^prefix\s+(\S+)/m);
    if (!match) return "your tmux prefix";
    return match[1]
      .replace(/^C-/, "Ctrl+")
      .replace(/^M-/, "Alt+")
      .replace(/^S-/, "Shift+")
      .replace(/(?<=Ctrl\+|Alt\+|Shift\+)([a-z])/, (_, c) => c.toUpperCase());
  } catch {
    return "your tmux prefix";
  }
}

function runSplitPane(vertical: boolean): void {
  const tmuxEnv = recoverTmuxEnv();
  if (!tmuxEnv) {
    console.log(
      "✗ Your Claude Code session isn't running inside tmux, so the picker\n" +
      "  can't open as a split pane.\n\n" +
      "  Fix — exit this Claude (Ctrl+D twice or /quit), then re-launch\n" +
      "  inside tmux:\n\n" +
      "      tmux new-session 'claude --plugin-dir ~/.openclaw/workspace/builds/claude-watch'\n\n" +
      "  Or open a tmux session first, then start Claude inside it:\n\n" +
      "      tmux\n" +
      "      claude --plugin-dir ~/.openclaw/workspace/builds/claude-watch\n\n" +
      "  Either way, every subsequent `/watched` will open the picker as a\n" +
      "  split pane next to your conversation."
    );
    process.exit(1);
  }
  // Pass the recovered TMUX value to the tmux subprocess so it targets the
  // correct server + session.
  const env = { ...process.env, TMUX: tmuxEnv };
  try {
    execFileSync(
      "tmux",
      ["split-window", vertical ? "-v" : "-h", "claude-watch pick"],
      { stdio: ["ignore", "ignore", "pipe"], env }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.log(`✗ tmux split-window failed: ${msg}`);
    process.exit(1);
  }
  const prefix = getTmuxPrefixKey(env);
  console.log(`✓ Picker opened in a new pane. Switch focus: ${prefix} then O`);
}

export async function runPick(args: string[] = []): Promise<void> {
  if (args.includes("--split-pane")) {
    runSplitPane(args.includes("--vertical"));
    return;
  }

  if (!process.stdout.isTTY) {
    process.stderr.write(
      "claude-watch pick requires a TTY. Use status, activate, or deactivate instead.\n"
    );
    process.exit(2);
  }

  // Ink 7 natively handles: alternate screen, synchronized output
  // (DECSET 2026 — atomic frames that don't race tmux's redraw), and
  // incremental rendering. The manual alt-screen dance and the
  // globalThis clear/rerender hacks we carried on Ink 5 existed to
  // paper over ghost-panel bugs that Ink 7's renderer doesn't produce.
  const instance = render(React.createElement(App), {
    alternateScreen: true,
    concurrent: true,
    incrementalRendering: true,
  });
  await instance.waitUntilExit();
}
