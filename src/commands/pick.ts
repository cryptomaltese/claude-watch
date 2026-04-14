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
  const { waitUntilExit } = render(React.createElement(App));
  await waitUntilExit();
}
