import React from "react";
import { render } from "ink";
import { App } from "../picker/App.js";

const ENTER_ALT_SCREEN = "\x1B[?1049h";
const LEAVE_ALT_SCREEN = "\x1B[?1049l";

export async function runPick(): Promise<void> {
  if (!process.stdout.isTTY) {
    process.stderr.write(
      "claude-watch pick requires a TTY. Use status, activate, or deactivate instead.\n"
    );
    process.exit(2);
  }

  // Enter alt screen so the picker owns the terminal during its lifetime.
  // Without this, Ink's inline rendering leaks old frames when the render
  // tree grows and shrinks between screens (list ↔ action menu, especially
  // with PeekPanel sizing variation), producing a duplicated-content artifact
  // on navigation back-and-forth.
  process.stdout.write(ENTER_ALT_SCREEN);

  let restored = false;
  const restore = (): void => {
    if (restored) return;
    restored = true;
    process.stdout.write(LEAVE_ALT_SCREEN);
  };

  // Ensure we restore the main screen even on abnormal exit.
  process.on("exit", restore);
  process.on("SIGINT", () => { restore(); process.exit(130); });
  process.on("SIGTERM", () => { restore(); process.exit(143); });

  try {
    const { waitUntilExit } = render(React.createElement(App));
    await waitUntilExit();
  } finally {
    restore();
  }
}
