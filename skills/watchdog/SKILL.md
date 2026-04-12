---
name: watchdog
description: Manage persistent Claude Code sessions — check status, start/stop/restart sessions, view logs
---

# Watchdog — Session Manager

Use this skill when the user asks about managing Claude Code sessions, checking session status, restarting sessions, or viewing watchdog logs.

## Available Commands

Run these via Bash:

```bash
# Show status of all watched sessions
claude-watch status

# Run a watchdog scan (start any dead sessions)
claude-watch scan

# Start/stop/restart a specific session
claude-watch start <name>
claude-watch stop <name>
claude-watch restart <name>

# Start/stop/restart all sessions
claude-watch start
claude-watch stop
claude-watch restart

# List discovered projects
claude-watch list

# View recent logs
claude-watch logs
claude-watch logs 100

# Install/uninstall the cron or systemd timer
claude-watch install
claude-watch uninstall
```

## How It Works

claude-watch scans a sessions directory for subdirectories containing `CLAUDE.md` files. Each directory becomes a tmux session named `claude-<dirname>`.

When a session dies, the watchdog:
1. Finds the most recent session ID from `~/.claude/projects/` history
2. Starts claude with `--resume <id> --fork-session` to preserve conversation context
3. Applies `--dangerously-skip-permissions --permission-mode bypassPermissions`
4. Activates `/remote-control` with a retry loop

## Configuration

Optional config at `~/.claude-watch/config.json`:

```json
{
  "sessionsDir": "/path/to/sessions",
  "prefix": "claude-",
  "remoteControl": true,
  "resume": true,
  "sessions": {
    "project-name": {
      "flags": "--name my-bot"
    }
  }
}
```

No config needed — convention-based by default (scans current directory for CLAUDE.md subdirs).

## Important Notes

- **Permissions**: Use `permissions.defaultMode: "bypassPermissions"` in `~/.claude/settings.json` — CLI flags don't reliably persist through session resume
- **Local overrides**: Watch for `.claude/settings.local.json` files with explicit allowlists — they override bypass mode
- **Remote control**: Activated via `tmux send-keys` with retry. No `--init` flag exists yet.
