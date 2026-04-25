---
name: claude-watch
description: Manage persistent Claude Code sessions — interactive picker, activate/deactivate, view logs
---

# claude-watch — Session Manager

Use this skill when the user asks about managing Claude Code sessions, checking session status, starting/stopping watched sessions, or viewing watchdog logs.

## Quick Commands

Run these via Bash:

```bash
claude-watch              # open interactive picker
claude-watch status       # show watched sessions
claude-watch scan         # run one watchdog cycle
claude-watch logs         # view recent logs
claude-watch install      # set up cron (first time only)
```

## How It Works

claude-watch maintains a watched list at `~/.claude-watch/watched.json`. When a watched session dies, cron runs `claude-watch scan` every 5 minutes to revive it.

The interactive picker (`claude-watch` with no args) shows all Claude Code sessions on the machine. Pick one to activate or deactivate watching. Press `ctrl-n` to create a new watched session from scratch.

## Troubleshooting missing dependencies

If claude-watch reports a missing dependency (tmux, ripgrep, or cron), help the user install it:

1. Detect the OS and package manager (check /etc/os-release, presence of apt/dnf/pacman/brew)
2. Propose the exact install command for their platform
3. Ask for confirmation before running (with sudo if needed)
4. Re-run the failing claude-watch command after install succeeds

## Important Notes

- **Permissions**: Use `permissions.defaultMode: "bypassPermissions"` in `~/.claude/settings.json`
- **Local overrides**: Watch for `.claude/settings.local.json` files with explicit allowlists
- **Remote control**: Activated via `tmux send-keys` with retry after session start
