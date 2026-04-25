import React from "react";
import { execFileSync } from "node:child_process";
import { render } from "ink";
import { App } from "../picker/App.js";

function getTmuxPrefixKey(): string {
  try {
    const out = execFileSync("tmux", ["show-options", "-g", "prefix"], {
      encoding: "utf-8",
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
  if (!process.env.TMUX) {
    console.log(
      "✗ Not inside tmux. The split-pane picker needs Claude Code to be running\n" +
      "  in a tmux pane.\n\n" +
      "  Alternative: run `claude-watch pick` directly in a regular terminal."
    );
    process.exit(1);
  }
  try {
    execFileSync(
      "tmux",
      ["split-window", vertical ? "-v" : "-h", "claude-watch pick"],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.log(`✗ tmux split-window failed: ${msg}`);
    process.exit(1);
  }
  const prefix = getTmuxPrefixKey();
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
