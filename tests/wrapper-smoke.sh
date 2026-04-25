#!/usr/bin/env bash
set -euo pipefail

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

DIST_DIR="$TMPDIR/dist"
BIN_DIR="$TMPDIR/bin"
mkdir -p "$DIST_DIR" "$BIN_DIR"

cat > "$DIST_DIR/cli.js" <<'NODEOF'
const fs = require('fs');
const sentinel = process.env.CLAUDE_WATCH_SENTINEL;
if (sentinel && process.argv.includes('--test-attach')) {
  fs.writeFileSync(sentinel, 'test-session-name');
}
process.exit(0);
NODEOF

sed "s|SCRIPT_DIR=.*|SCRIPT_DIR=\"$BIN_DIR\"|" bin/claude-watch > "$BIN_DIR/claude-watch"
chmod +x "$BIN_DIR/claude-watch"

TMUX_LOG="$TMPDIR/tmux.log"
cat > "$TMPDIR/tmux" <<TMUXEOF
#!/bin/bash
echo "\$@" > "$TMUX_LOG"
exit 0
TMUXEOF
chmod +x "$TMPDIR/tmux"

PATH="$TMPDIR:$PATH" "$BIN_DIR/claude-watch" version
if [ -f "$TMUX_LOG" ]; then
    echo "FAIL: tmux called when no attach expected"
    exit 1
fi

PATH="$TMPDIR:$PATH" "$BIN_DIR/claude-watch" --test-attach || true
if [ ! -f "$TMUX_LOG" ]; then
    echo "FAIL: tmux not called after sentinel written"
    exit 1
fi

if ! grep -q "attach -t test-session-name" "$TMUX_LOG"; then
    echo "FAIL: tmux called with wrong args"
    cat "$TMUX_LOG"
    exit 1
fi

echo "PASS: wrapper smoke test"
