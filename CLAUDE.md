# claude-watch

Session watchdog and manager for Claude Code. Keeps persistent tmux-based sessions alive with auto-resume, remote control, and bypass permissions.

## Structure

- `bin/claude-watch` — main CLI (bash)
- `skills/watchdog/SKILL.md` — in-session skill for managing sessions
- `hooks/` — SessionStart hook for permission/config validation
- `.claude-plugin/plugin.json` — plugin manifest
- `config.example.json` — example config

## Dev notes

- Slug generation must replace both `/` and `.` with `-` to match Claude Code's project path slugging
- `permissions.defaultMode` in settings.json is the only reliable way to enforce bypass — CLI flags don't survive resume
- Remote control activation requires tmux send-keys with retry (no --init flag exists)
