import React from "react";
import { render } from "ink";
import { App } from "../picker/App.js";

export async function runPick(): Promise<void> {
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
