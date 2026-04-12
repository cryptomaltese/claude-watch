# claude-watch

Persistent, auto-resuscitating Claude Code sessions with remote control.

Keep your coding agents alive across crashes, reboots, and rate limits. When a session dies, claude-watch finds its last conversation, resumes it, re-enables remote control, and gets back to work — no babysitting required.

## What it does

- **Auto-discovers** project directories (any folder with a `CLAUDE.md`)
- **Detects dead sessions** and restarts them in tmux
- **Resumes conversation history** from the most recent session ID
- **Activates remote control** automatically with retry
- **Bypasses permissions** reliably (via settings, not CLI flags)
- **Zero config** — works out of the box with convention, optional config for overrides

## Install

### As a Claude Code plugin

```bash
/plugin install claude-watch@claude-plugins-official
```

### Manual

```bash
git clone https://github.com/openclaw/claude-watch
cd claude-watch
ln -s $(pwd)/bin/claude-watch ~/.local/bin/claude-watch
claude-watch install
```

## Quick start

```bash
# Point it at your sessions directory
cd ~/projects/sessions
claude-watch scan      # start any dead sessions
claude-watch status    # see what's running
```

## Commands

| Command | Description |
|---------|-------------|
| `scan` | Run one watchdog cycle — start any dead sessions |
| `status` | Show status of all watched sessions |
| `start [name]` | Start a session (or all) |
| `stop [name]` | Stop a session (or all) |
| `restart [name]` | Restart a session (or all) |
| `list` | List discovered project directories |
| `add <dir>` | Prepare a directory for watching |
| `logs [n]` | Show last n log lines (default: 50) |
| `install` | Set up cron or systemd timer (every 5 min) |
| `uninstall` | Remove cron/systemd timer |

## Configuration

Works with zero config. Optionally create `~/.claude-watch/config.json`:

```json
{
  "sessionsDir": "/home/user/projects/sessions",
  "prefix": "claude-",
  "remoteControl": true,
  "resume": true,
  "sessions": {
    "trading": {
      "flags": "--name trading-bot"
    }
  }
}
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `CLAUDE_WATCH_SESSIONS_DIR` | Override sessions directory |
| `CLAUDE_WATCH_CONFIG_DIR` | Override config directory (default: `~/.claude-watch`) |
| `CLAUDE_WATCH_LOG` | Override log file path |

## How it works

```
[cron/systemd: every 5 min]
        |
        v
  claude-watch scan
        |
        v
  For each dir with CLAUDE.md:
    Is tmux session alive? → skip
    Dead? →
      1. Find latest .jsonl in ~/.claude/projects/<slug>/
      2. tmux new-session with --resume <id> --fork-session
      3. Send /remote-control with retry (3 attempts, 10s each)
      4. Log result
```

## Lessons learned (the hard way)

- **`--dangerously-skip-permissions` doesn't stick on resume.** The resumed session restores its original permission mode. Use `permissions.defaultMode: "bypassPermissions"` in `~/.claude/settings.json` instead.
- **Local `.claude/settings.local.json` with allowlists override bypass mode.** The plugin's SessionStart hook warns about this.
- **`--fork-session` creates a new ID but still loads old permission state.** Settings-level bypass is the only reliable fix.
- **No `--init` flag exists** for auto-running commands on session start. `/remote-control` must be sent via `tmux send-keys` with a retry loop.

## Requirements

- tmux
- jq (optional, for config file support)
- Claude Code CLI

## License

MIT
