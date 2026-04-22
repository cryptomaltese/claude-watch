# Optional --fork-session Implementation Plan

> **SUPERSEDED 2026-04-22.** This plan shipped in commits `bf5ae4d` + `9c59bca`, then was reverted because the boolean-config shape was wrong. Forking is a rare deliberate action (name the fork, choose watching disposition for OG vs fork, choose attach target) — not a workflow toggle. A future plan will design Fork as a picker-level action with its own subflow. Preserved here as historical context; do NOT execute.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `--fork-session` opt-in via a new `forkOnResume` config key (default `false`) so respawns preserve the original jsonl and Claude Desktop keeps the user's session title.

**Architecture:** Add `forkOnResume: boolean` to `Config` alongside the existing `permissionMode` / `dangerouslySkipPermissions` fields. `buildClaudeCmd` reads it and conditionally appends `--fork-session`. No concurrent-writer guard is added: claude-watch already funnels every spawn through `findTmuxForCwd`, which adopts-if-alive (`activate`, `createNew`) or kills-then-respawns (`refresh`, `scan`). At most one claude process per cwd exists by construction, so two writers cannot race on the same jsonl unless the user manually runs `claude` outside tmux — documented as the single reason to flip the flag on.

**Tech Stack:** TypeScript, bun:test, existing `Config` schema in `src/core/config.ts`, `buildClaudeCmd` in `src/core/actions.ts`.

---

## File Structure

**Modified:**
- `src/core/config.ts` — add `forkOnResume` to `Config` type, `DEFAULTS`, and the `loadConfig` parse path.
- `src/core/actions.ts` — `buildClaudeCmd` conditionally appends `--fork-session`.
- `tests/core/config.test.ts` — assert new default and that custom values round-trip.
- `tests/core/actions.test.ts` — existing assertions on `--resume <id>` continue to pass; add focused tests for the config-driven fork behavior that set `forkOnResume` via a temp config file.
- `README.md` — document the flag and the one scenario where enabling it matters.

**Not modified:** `src/commands/scan.ts` and the rest of `src/commands/*` — they call `buildClaudeCmd`, so they inherit the new behavior automatically.

---

## Task 1: Add `forkOnResume` to the Config type and defaults

**Files:**
- Modify: `src/core/config.ts` (interface `Config`, `DEFAULTS`, `loadConfig`)
- Test: `tests/core/config.test.ts`

- [ ] **Step 1: Write the failing test for the default value**

Append to `tests/core/config.test.ts` inside the `describe("config", ...)` block, after the existing `"returns defaults when no config file"` test:

```ts
  test("forkOnResume defaults to false", () => {
    const cfg = loadConfig();
    expect(cfg.forkOnResume).toBe(false);
  });
```

- [ ] **Step 2: Run the test and verify it fails**

Run from `/home/maltese/.openclaw/workspace/builds/claude-watch/`:

```bash
bun test tests/core/config.test.ts -t "forkOnResume defaults to false"
```

Expected: FAIL. TypeScript compile error `Property 'forkOnResume' does not exist on type 'Config'`, or (if bun's loose type-check lets it through) a runtime `expect(undefined).toBe(false)` failure.

- [ ] **Step 3: Add `forkOnResume` to the Config interface**

In `src/core/config.ts`, modify the `Config` interface (currently lines 17–35). After the `dangerouslySkipPermissions` field, add a new field. The full interface becomes:

```ts
export interface Config {
  peekLines: number;
  pageSize: number;
  remoteControl: boolean;
  resume: boolean;
  /**
   * Permission mode passed to claude on spawn via `--permission-mode`.
   * Default "auto" routes decisions through the auto-mode classifier, which
   * has explicit allow rules for routine memory writes — unlike bypass,
   * which is blocked by the native memory-dir protection above bypass.
   */
  permissionMode: PermissionMode;
  /**
   * When true, claude is spawned with `--dangerously-skip-permissions`.
   * Blunter than permissionMode; hits the native memory-dir prompt issue.
   * Off by default. Opt-in for users who explicitly want the nuclear option.
   */
  dangerouslySkipPermissions: boolean;
  /**
   * When true, resumes use `--fork-session`, which creates a new jsonl branch
   * for every respawn. Safer against concurrent writers, but loses Desktop
   * conversation titles and breaks continuity across respawns.
   *
   * Off by default: claude-watch funnels every spawn through findTmuxForCwd,
   * so at most one claude runs per cwd — concurrent writers are impossible
   * within claude-watch. Enable this only if you also run `claude --resume`
   * manually outside tmux on a cwd that claude-watch already manages.
   */
  forkOnResume: boolean;
}
```

- [ ] **Step 4: Add the default value**

In `src/core/config.ts`, modify the `DEFAULTS` object (currently lines 37–44):

```ts
const DEFAULTS: Config = {
  peekLines: 7,
  pageSize: 10,
  remoteControl: true,
  resume: true,
  permissionMode: "auto",
  dangerouslySkipPermissions: false,
  forkOnResume: false,
};
```

- [ ] **Step 5: Parse the new field in `loadConfig`**

In `src/core/config.ts`, modify the return object inside `loadConfig` (currently lines 73–83). Add the `forkOnResume` field at the end:

```ts
    return {
      peekLines: typeof parsed.peekLines === "number" ? parsed.peekLines : DEFAULTS.peekLines,
      pageSize: typeof parsed.pageSize === "number" ? parsed.pageSize : DEFAULTS.pageSize,
      remoteControl: typeof parsed.remoteControl === "boolean" ? parsed.remoteControl : DEFAULTS.remoteControl,
      resume: typeof parsed.resume === "boolean" ? parsed.resume : DEFAULTS.resume,
      permissionMode,
      dangerouslySkipPermissions:
        typeof parsed.dangerouslySkipPermissions === "boolean"
          ? parsed.dangerouslySkipPermissions
          : DEFAULTS.dangerouslySkipPermissions,
      forkOnResume:
        typeof parsed.forkOnResume === "boolean"
          ? parsed.forkOnResume
          : DEFAULTS.forkOnResume,
    };
```

- [ ] **Step 6: Run the default-value test and verify it passes**

Run:

```bash
bun test tests/core/config.test.ts -t "forkOnResume defaults to false"
```

Expected: PASS.

- [ ] **Step 7: Write the failing test for reading `forkOnResume: true` from disk**

Append to `tests/core/config.test.ts` inside the same `describe` block:

```ts
  test("forkOnResume round-trips from config file", () => {
    writeFileSync(
      join(dir, "config.json"),
      JSON.stringify({ forkOnResume: true })
    );
    const cfg = loadConfig();
    expect(cfg.forkOnResume).toBe(true);
  });

  test("forkOnResume falls back to default for non-boolean value", () => {
    writeFileSync(
      join(dir, "config.json"),
      JSON.stringify({ forkOnResume: "yes" })
    );
    const cfg = loadConfig();
    expect(cfg.forkOnResume).toBe(false);
  });
```

- [ ] **Step 8: Run both tests and verify they pass**

Run:

```bash
bun test tests/core/config.test.ts -t "forkOnResume"
```

Expected: three tests reported, all PASS (the default test from Step 1 plus the two new ones).

- [ ] **Step 9: Run the full config test file to guard against regressions**

Run:

```bash
bun test tests/core/config.test.ts
```

Expected: every test in the file passes (8 pre-existing + 3 new = 11 tests).

- [ ] **Step 10: Commit**

```bash
cd /home/maltese/.openclaw/workspace/builds/claude-watch
git add src/core/config.ts tests/core/config.test.ts
git commit -m "feat(config): add forkOnResume flag (default false)"
```

---

## Task 2: Gate `--fork-session` on the new config key

**Files:**
- Modify: `src/core/actions.ts` (`buildClaudeCmd`, lines 67–74)
- Test: `tests/core/actions.test.ts`

**Context on concurrent writers:** every path that calls `buildClaudeCmd` already checks `findTmuxForCwd` first. `activate` (line 113) and `createNew` (line 161) adopt existing sessions without respawning. `refresh` (line 194) explicitly kills the existing session before spawning. `scan` (src/commands/scan.ts:58) skips revival when a tmux session is already alive. So dropping `--fork-session` cannot produce two concurrent writers to the same jsonl from within claude-watch. No concurrency guard is added in this task — the existing `findTmuxForCwd` funnel is the guard.

- [ ] **Step 1: Write the failing test — default (no config file) omits `--fork-session`**

Append to `tests/core/actions.test.ts`, inside the `describe("actions", ...)` block, after the existing `"activate starts tmux session"` test:

```ts
  test("buildClaudeCmd omits --fork-session by default", async () => {
    const { buildClaudeCmd } = await import("../../src/core/actions");
    const cmd = buildClaudeCmd(JSONL_ID);
    expect(cmd).toContain(`--resume ${JSONL_ID}`);
    expect(cmd).not.toContain("--fork-session");
  });
```

Note: `f.setEnv()` (called in `beforeEach`) sets `CLAUDE_WATCH_CONFIG_DIR` to an empty temp dir, so `loadConfig()` returns defaults. No additional setup needed.

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
bun test tests/core/actions.test.ts -t "buildClaudeCmd omits --fork-session by default"
```

Expected: FAIL. The assertion `expect(cmd).not.toContain("--fork-session")` fires because the current implementation always appends it.

- [ ] **Step 3: Update `buildClaudeCmd` to gate the flag on config**

In `src/core/actions.ts`, replace the current `buildClaudeCmd` (lines 67–74):

```ts
export function buildClaudeCmd(jsonlId: string | null): string {
  const config = loadConfig();
  let cmd = "claude";
  if (config.dangerouslySkipPermissions) cmd += " --dangerously-skip-permissions";
  cmd += ` --permission-mode ${config.permissionMode}`;
  if (jsonlId) {
    cmd += ` --resume ${jsonlId}`;
    if (config.forkOnResume) cmd += " --fork-session";
  }
  return cmd;
}
```

- [ ] **Step 4: Run the default-omits test and verify it passes**

Run:

```bash
bun test tests/core/actions.test.ts -t "buildClaudeCmd omits --fork-session by default"
```

Expected: PASS.

- [ ] **Step 5: Write the failing test — `forkOnResume: true` appends `--fork-session`**

Append to `tests/core/actions.test.ts`, inside the same `describe` block:

```ts
  test("buildClaudeCmd appends --fork-session when forkOnResume=true", async () => {
    const { writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    writeFileSync(
      join(process.env.CLAUDE_WATCH_CONFIG_DIR!, "config.json"),
      JSON.stringify({ forkOnResume: true })
    );
    const { buildClaudeCmd } = await import("../../src/core/actions");
    const cmd = buildClaudeCmd(JSONL_ID);
    expect(cmd).toContain(`--resume ${JSONL_ID}`);
    expect(cmd).toContain("--fork-session");
  });

  test("buildClaudeCmd omits --fork-session when no jsonlId (fresh session)", async () => {
    const { writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    writeFileSync(
      join(process.env.CLAUDE_WATCH_CONFIG_DIR!, "config.json"),
      JSON.stringify({ forkOnResume: true })
    );
    const { buildClaudeCmd } = await import("../../src/core/actions");
    const cmd = buildClaudeCmd(null);
    expect(cmd).not.toContain("--resume");
    expect(cmd).not.toContain("--fork-session");
  });
```

The `f.setEnv()` fixture (from `tests/helpers/fixture`) points `CLAUDE_WATCH_CONFIG_DIR` at `f.root`, which is a writable temp dir. Writing `config.json` under it is the same pattern used by the existing config tests.

- [ ] **Step 6: Run both new tests and verify they pass**

Run:

```bash
bun test tests/core/actions.test.ts -t "buildClaudeCmd"
```

Expected: three `buildClaudeCmd` tests run, all PASS.

- [ ] **Step 7: Verify the existing `activate starts tmux session` test still passes**

The existing test at line 38–47 asserts `expect(session.cmd).toContain(\`--resume ${JSONL_ID}\`)`. It does NOT assert anything about `--fork-session`, so it continues to pass under the new default. Confirm:

```bash
bun test tests/core/actions.test.ts -t "activate starts tmux session"
```

Expected: PASS.

- [ ] **Step 8: Run the full actions test file**

Run:

```bash
bun test tests/core/actions.test.ts
```

Expected: every test in the file passes (10 pre-existing + 3 new = 13 tests).

- [ ] **Step 9: Run the entire test suite to catch anything else that relied on `--fork-session`**

Run:

```bash
bun test
```

Expected: every test passes. If any test in `tests/commands/**` or elsewhere asserts `--fork-session` literally, it will fail — in that case, update the assertion to match the new default (either drop the `--fork-session` expectation, or set `forkOnResume: true` in that test's config, matching the style used in Step 5). Do NOT change production behavior to satisfy a test; change the test.

- [ ] **Step 10: Commit**

```bash
cd /home/maltese/.openclaw/workspace/builds/claude-watch
git add src/core/actions.ts tests/core/actions.test.ts
git commit -m "feat(actions): gate --fork-session on forkOnResume config"
```

---

## Task 3: Update README to document the flag and its migration

**Files:**
- Modify: `README.md` (lines 84–99, the "How it works" block)

- [ ] **Step 1: Update the "How it works" diagram**

In `README.md`, replace line 96 (`    2. Start tmux with --resume <id> --fork-session`) with:

```
    2. Start tmux with --resume <id> (add --fork-session if forkOnResume=true)
```

- [ ] **Step 2: Add a configuration note below the diagram**

In `README.md`, after line 99 (the closing ``` of the "How it works" block) and before line 101 (`## Development`), insert:

````markdown

### Config flags (`~/.claude-watch/config.json`)

- `forkOnResume` (default `false`): when `true`, resumes use `--fork-session`, creating a new jsonl branch on every respawn. Off by default so respawns preserve the original jsonl — Claude Desktop keeps the session title, and `/resume` behaves like Claude's native flow.

  Enable only if you also run `claude --resume` manually outside tmux against a cwd that claude-watch manages. In that setup two processes could write to the same jsonl; forking sidesteps the race at the cost of continuity.

**Migration note:** prior versions always forked. After upgrading, the next respawn for each watched session will resume into the original jsonl instead of creating a branch. Existing forked branches stay on disk; they're picked up by `scan`'s roll-forward if they're newer than the pinned jsonl.

````

- [ ] **Step 3: Verify the README renders correctly**

Run:

```bash
bun run build
```

Expected: build succeeds (README isn't compiled, but the pre-commit hook rebuilds `dist/`; running it here catches any unrelated breakage before committing).

- [ ] **Step 4: Commit**

```bash
cd /home/maltese/.openclaw/workspace/builds/claude-watch
git add README.md
git commit -m "docs: document forkOnResume flag and migration"
```

---

## Task 4: Final verification

- [ ] **Step 1: Run the full suite one more time**

Run:

```bash
cd /home/maltese/.openclaw/workspace/builds/claude-watch
bun test
```

Expected: every test passes.

- [ ] **Step 2: Run lint (if present) and build**

Run:

```bash
bun run build
```

Expected: `dist/cli.js` is regenerated without errors.

- [ ] **Step 3: Manually verify the command string**

Run a one-liner to confirm the default path:

```bash
cd /home/maltese/.openclaw/workspace/builds/claude-watch
CLAUDE_WATCH_CONFIG_DIR=$(mktemp -d) bun -e 'import("./src/core/actions").then(m => console.log(m.buildClaudeCmd("abc12345-1234-1234-1234-abc123456789")))'
```

Expected output (exactly one line):

```
claude --permission-mode auto --resume abc12345-1234-1234-1234-abc123456789
```

No `--fork-session`. No `--dangerously-skip-permissions`.

- [ ] **Step 4: Manually verify the opt-in path**

```bash
cd /home/maltese/.openclaw/workspace/builds/claude-watch
TMPDIR=$(mktemp -d)
echo '{"forkOnResume": true}' > "$TMPDIR/config.json"
CLAUDE_WATCH_CONFIG_DIR="$TMPDIR" bun -e 'import("./src/core/actions").then(m => console.log(m.buildClaudeCmd("abc12345-1234-1234-1234-abc123456789")))'
rm -rf "$TMPDIR"
```

Expected output:

```
claude --permission-mode auto --resume abc12345-1234-1234-1234-abc123456789 --fork-session
```

- [ ] **Step 5: Confirm the git log shows three focused commits**

```bash
cd /home/maltese/.openclaw/workspace/builds/claude-watch
git log --oneline -3
```

Expected: three commits, in order (most recent first):

```
<sha> docs: document forkOnResume flag and migration
<sha> feat(actions): gate --fork-session on forkOnResume config
<sha> feat(config): add forkOnResume flag (default false)
```

No further commit is needed — the feature is complete.
