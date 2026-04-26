import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir, ensureConfigDir } from "./core/config.js";
import { readAndClearNotices } from "./core/notices.js";
import { VERSION } from "./version.js";

function checkDep(binary: string, name: string): void {
  try {
    execFileSync("which", [binary], { stdio: "ignore" });
  } catch {
    const hints: Record<string, string> = {
      tmux: "  Debian/Ubuntu: sudo apt install tmux\n  macOS: brew install tmux",
      rg: "  Debian/Ubuntu: sudo apt install ripgrep\n  macOS: brew install ripgrep",
      crontab: "  Debian/Ubuntu: sudo apt install cron\n  macOS: cron is built-in",
    };
    process.stderr.write(
      `claude-watch: ${name} is required but not found in PATH.\n${hints[binary] ?? ""}\n`
    );
    process.exit(127);
  }
}

function checkDeps(): void {
  checkDep("tmux", "tmux");
  checkDep("rg", "ripgrep");
  checkDep("crontab", "cron");
}

function showNotices(): void {
  const notices = readAndClearNotices();
  for (const n of notices) {
    process.stderr.write(`⚠ ${n.message}\n`);
  }
}

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? "pick";
  const args = process.argv.slice(3);

  ensureConfigDir();

  if (cmd === "_hook") {
    const { runHook } = await import("./commands/_hook.js");
    runHook(args[0]);
    return;
  }

  if (!["help", "--help", "-h", "version", "--version", "-v"].includes(cmd)) {
    checkDeps();
  }

  if (["pick", "status", "activate", "deactivate", "new", "logs"].includes(cmd)) {
    showNotices();
  }

  switch (cmd) {
    case "pick":
    case undefined: {
      const { runPick } = await import("./commands/pick.js");
      await runPick(args);
      break;
    }
    case "scan": {
      const { runScan } = await import("./commands/scan.js");
      await runScan();
      break;
    }
    case "status": {
      const { runStatus } = await import("./commands/status.js");
      await runStatus(args);
      break;
    }
    case "activate": {
      const { runActivate } = await import("./commands/activate.js");
      await runActivate(args);
      break;
    }
    case "deactivate": {
      const { runDeactivate } = await import("./commands/deactivate.js");
      await runDeactivate(args);
      break;
    }
    case "new": {
      const { runNew } = await import("./commands/new.js");
      await runNew(args);
      break;
    }
    case "open": {
      const { runOpen } = await import("./commands/open.js");
      await runOpen(args);
      break;
    }
    case "attach": {
      const { runAttach } = await import("./commands/attach.js");
      await runAttach(args);
      break;
    }
    case "refresh": {
      const { runRefresh } = await import("./commands/refresh.js");
      await runRefresh(args);
      break;
    }
    case "fork": {
      const { runFork } = await import("./commands/fork.js");
      await runFork(args);
      break;
    }
    case "logs": {
      const { runLogs } = await import("./commands/logs.js");
      runLogs(args);
      break;
    }
    case "install": {
      const { runInstall } = await import("./commands/install.js");
      runInstall();
      break;
    }
    case "uninstall": {
      const { runUninstall } = await import("./commands/uninstall.js");
      runUninstall();
      break;
    }
    case "version":
    case "--version":
    case "-v":
      console.log(`claude-watch v${VERSION}`);
      break;
    case "help":
    case "--help":
    case "-h": {
      const { runHelp } = await import("./commands/help.js");
      runHelp();
      break;
    }
    default:
      process.stderr.write(`claude-watch: unknown command '${cmd}'\nRun 'claude-watch help' for usage.\n`);
      process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`claude-watch: ${err.message}\n`);
  process.exit(1);
});
