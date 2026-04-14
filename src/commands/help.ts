export function runHelp(): void {
  console.log(`claude-watch v0.2.0 — persistent auto-resuscitating Claude Code sessions

Usage: claude-watch [command] [args]

Commands:
  (default)         Open the interactive session picker
  pick              Alias for default
  scan              Run one watchdog cycle (cron entrypoint)
  status            Show status of all watched sessions
  new <dir>         Create a new watched session
  activate <dir>    Activate watching on a directory
  deactivate <dir>  Deactivate watching on a directory
  logs [n]          Show last n log lines (default: 50)
  install           Set up cron entry
  uninstall         Remove cron entry
  version           Show version
  help              Show this help

Flags:
  activate --jsonl <id>     Pin to a specific session ID
  deactivate --no-kill      Remove from watch list but keep tmux alive

Environment:
  CLAUDE_WATCH_CONFIG_DIR     Override config/state directory (~/.claude-watch)
  CLAUDE_WATCH_PROJECTS_DIR   Override Claude Code projects directory
  CLAUDE_WATCH_DEBUG=1        Enable debug logging`);
}
