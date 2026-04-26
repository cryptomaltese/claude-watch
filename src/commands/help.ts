import { VERSION } from "../version.js";

export function runHelp(): void {
  console.log(`claude-watch v${VERSION} — persistent auto-resuscitating Claude Code sessions

Usage: claude-watch [command] [args]

Commands:
  open                      Launch Claude inside tmux with this plugin loaded
                            — use this instead of \`claude\` when you want
                            /watched and the picker available
  (default) / pick          Open the interactive session picker
  scan                      Run one watchdog cycle (cron entrypoint)
  status [--json]           Show watched session status; --json adds enriched view
  new <dir>                 Create a new watched session
  activate <dir>            Activate watching on a directory
  deactivate <dir>          Deactivate watching on a directory
  refresh <dir>             Kill + respawn claude in a watched dir (keeps jsonl lineage)
  fork <src> <target>       Fork a session from <src> cwd into <target> cwd
  attach <dir>              Switch tmux focus to a watched session's pane
  logs [n]                  Show last n log lines (default: 50)
  install                   Set up cron entry
  uninstall                 Remove cron entry
  version                   Show version
  help                      Show this help

Flags:
  activate --jsonl <id>     Pin to a specific session ID
  deactivate --no-kill      Remove from watch list but keep tmux alive
  status --json             Emit enriched session list as JSON

Environment:
  CLAUDE_WATCH_CONFIG_DIR     Override config/state directory (~/.claude-watch)
  CLAUDE_WATCH_PROJECTS_DIR   Override Claude Code projects directory
  CLAUDE_WATCH_DEBUG=1        Enable debug logging`);
}
