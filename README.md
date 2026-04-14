# claude-watch

Persistent, auto-resuscitating Claude Code sessions with an interactive picker.

Keep your coding agents alive across crashes, reboots, and rate limits. When a session dies, claude-watch finds its last conversation, resumes it, re-enables remote control, and gets back to work.

## What it does

- **Interactive picker** — browse all your Claude Code sessions, newest first
- **Deep search** — type to search across transcript history (powered by ripgrep)
- **One-click activate** — watch any session; cron revives it if it dies
- **New sessions** — create a brand-new watched session with ctrl-n
- **Resume with context** — auto-resumes from the latest conversation thread
- **Remote control** — automatically activates `/remote-control` with retry
- **Bypass permissions** — sessions run with full bypass (via settings.json)
- **Zero config** — works out of the box after plugin install

## Install

```bash
/plugin install claude-watch
```

Then run any `claude-watch` command — it will prompt to set up cron on first use.

## Quick start

```bash
claude-watch              # open the interactive picker
claude-watch status       # show watched sessions
claude-watch scan         # run one watchdog cycle manually
```

## Commands

| Command | Description |
|---------|-------------|
| `claude-watch` | Open the interactive session picker |
| `claude-watch pick` | Alias for above |
| `claude-watch scan` | Run one watchdog cycle (cron entrypoint) |
| `claude-watch status` | Show status of all watched sessions |
| `claude-watch new <dir>` | Create a new watched session |
| `claude-watch activate <dir>` | Start watching a directory |
| `claude-watch deactivate <dir>` | Stop watching a directory |
| `claude-watch logs [n]` | Show last n log lines (default: 50) |
| `claude-watch install` | Set up cron entry |
| `claude-watch uninstall` | Remove cron entry |

### Flags

- `activate --jsonl <id>` — pin to a specific session ID
- `deactivate --no-kill` — stop watching but keep tmux alive

## Configuration

Optional config at `~/.claude-watch/config.json`:

```json
{
  "peekLines": 7,
  "pageSize": 10,
  "remoteControl": true,
  "resume": true
}
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `CLAUDE_WATCH_CONFIG_DIR` | Override config/state directory |
| `CLAUDE_WATCH_PROJECTS_DIR` | Override Claude Code projects directory |
| `CLAUDE_WATCH_DEBUG=1` | Enable debug logging |

## Requirements

- node >= 20
- tmux
- ripgrep
- cron

## How it works

```
[cron: every 5 min]
      |
      v
claude-watch scan
      |
      v
For each entry in watched.json:
  Roll forward to newest jsonl if available
  Is tmux session alive? → skip
  Dead? →
    1. Validate pinned jsonl (fallback chain if malformed)
    2. Start tmux with --resume <id> --fork-session
    3. Activate /remote-control with retry
    4. Log result
```

## Development

```bash
bun install
bun test
bun run build
```

Tests use temp directories and mock tmux — no live sessions needed.

**Build:** `bun run build` bundles everything into `dist/cli.js`. The pre-commit hook auto-rebuilds when `src/` changes.

**CI:** GitHub Actions runs lint, tests, build, bundle-freshness gate, and wrapper smoke test.

## License

MIT
