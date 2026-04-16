import { loadState } from "../core/state.js";
import { getTmuxDriver } from "../core/tmux.js";
import { findTmuxForCwd } from "../core/actions.js";
import { basename } from "node:path";

export function runStatus(): void {
  const state = loadState();
  const driver = getTmuxDriver();

  if (state.entries.length === 0) {
    console.log("No watched sessions.");
    return;
  }

  console.log(
    `${"SESSION".padEnd(20)} ${"STATUS".padEnd(10)} ${"PINNED".padEnd(14)} DIRECTORY`
  );
  console.log(
    `${"-------".padEnd(20)} ${"------".padEnd(10)} ${"------".padEnd(14)} ---------`
  );

  for (const entry of state.entries) {
    const tmuxName = findTmuxForCwd(driver, entry.cwd);
    const alive = tmuxName !== null;
    const status = alive ? "ALIVE" : "DEAD";
    const pinned = entry.pinnedJsonl ? entry.pinnedJsonl.slice(0, 8) + "..." : "(new)";
    console.log(
      `${basename(entry.cwd).padEnd(20)} ${status.padEnd(10)} ${pinned.padEnd(14)} ${entry.cwd}`
    );
  }
}
