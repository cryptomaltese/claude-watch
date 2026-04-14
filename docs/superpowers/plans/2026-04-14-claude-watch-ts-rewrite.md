# claude-watch TypeScript Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bash-based claude-watch with a TypeScript/Ink rewrite featuring an interactive session picker, watched-state persistence, and zero-fiddle plugin packaging.

**Architecture:** Single TS codebase. `core/` is pure logic with injectable drivers. `picker/` is an Ink TUI rendering `core/` state. `commands/` dispatch CLI verbs. Bash wrapper handles tmux attach handoff via sentinel file. Pre-bundled `dist/cli.js` committed to git; cron points at a stable copy in `~/.claude-watch/`.

**Tech Stack:** TypeScript, bun (build + test), Ink 5 (TUI), React 18, proper-lockfile, node ≥20. Runtime deps: tmux, ripgrep, cron.

**Spec:** `docs/superpowers/specs/2026-04-12-claude-watch-picker-design.md`

---

## File Structure

### Files to delete (old bash implementation)

- `bin/claude-watch` (replaced by new bash wrapper)
- `hooks/session-start` (logic moves to `src/core/hooks/sessionStart.ts`)
- `skills/watchdog/SKILL.md` (renamed to `skills/claude-watch/SKILL.md`)
- `CLAUDE.md` (dev notes folded into README)
- `config.example.json` (config documented in README)

### Files to create

**Root config:**
- `package.json` — deps, scripts, engines
- `tsconfig.json` — strict TS config
- `bunfig.toml` — bun test config (if needed)

**Bash wrapper:**
- `bin/claude-watch` — sentinel handoff wrapper (rewritten)

**Core modules:**
- `src/cli.ts` — command dispatcher + dep checker
- `src/core/slug.ts` — path ↔ slug conversion
- `src/core/config.ts` — config loading + env vars + defaults
- `src/core/log.ts` — leveled logger with rotation
- `src/core/notices.ts` — deferred user messages
- `src/core/sessions.ts` — walk `~/.claude/projects`, read jsonls
- `src/core/tmux.ts` — TmuxDriver interface + real implementation
- `src/core/state.ts` — watched.json CRUD + roll-forward + locking
- `src/core/actions.ts` — activate, deactivate, new transitions
- `src/core/hooks/sessionStart.ts` — SessionStart hook

**Commands:**
- `src/commands/version.ts`
- `src/commands/help.ts`
- `src/commands/logs.ts`
- `src/commands/status.ts`
- `src/commands/activate.ts`
- `src/commands/deactivate.ts`
- `src/commands/new.ts`
- `src/commands/scan.ts`
- `src/commands/install.ts`
- `src/commands/uninstall.ts`
- `src/commands/pick.ts`
- `src/commands/_hook.ts`

**Picker (Ink):**
- `src/picker/App.tsx`
- `src/picker/SessionList.tsx`
- `src/picker/PeekPanel.tsx`
- `src/picker/ActionMenu.tsx`
- `src/picker/NewSessionInput.tsx`
- `src/picker/hooks/useSessions.ts`
- `src/picker/hooks/useSearch.ts`
- `src/picker/theme.ts` — colors, styles

**Tests:**
- `tests/helpers/fixture.ts`
- `tests/core/slug.test.ts`
- `tests/core/config.test.ts`
- `tests/core/log.test.ts`
- `tests/core/notices.test.ts`
- `tests/core/sessions.test.ts`
- `tests/core/tmux.test.ts`
- `tests/core/state.test.ts`
- `tests/core/actions.test.ts`
- `tests/core/hooks/sessionStart.test.ts`
- `tests/commands/scan.test.ts`
- `tests/commands/install.test.ts`
- `tests/commands/status.test.ts`
- `tests/picker/SessionList.test.tsx`
- `tests/picker/ActionMenu.test.tsx`
- `tests/picker/NewSessionInput.test.tsx`
- `tests/picker/App.test.tsx`
- `tests/wrapper-smoke.sh`

**Plugin:**
- `.claude-plugin/plugin.json` (update)
- `hooks/hooks.json` (update)
- `skills/claude-watch/SKILL.md` (create, replaces watchdog)
- `README.md` (rewrite)

**CI:**
- `.github/workflows/ci.yml`
- `.husky/pre-commit`

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`
- Modify: `.gitignore`
- Delete: `CLAUDE.md`, `config.example.json`, `hooks/session-start`, `skills/watchdog/SKILL.md`
- Create directories: `src/core/`, `src/core/hooks/`, `src/commands/`, `src/picker/`, `src/picker/hooks/`, `tests/core/`, `tests/core/hooks/`, `tests/commands/`, `tests/picker/`, `tests/helpers/`

- [ ] **Step 1: Delete old implementation files**

```bash
rm -f CLAUDE.md config.example.json hooks/session-start
rm -rf skills/watchdog
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "claude-watch",
  "version": "0.2.0",
  "type": "module",
  "engines": { "node": ">=20" },
  "bin": { "claude-watch": "./bin/claude-watch" },
  "scripts": {
    "build": "bun build src/cli.ts --target=node --outfile=dist/cli.js --minify --banner=\"#!/usr/bin/env node\"",
    "dev": "bun run src/cli.ts",
    "test": "bun test",
    "lint": "tsc --noEmit",
    "prepare": "husky"
  },
  "dependencies": {
    "ink": "^5.0.1",
    "react": "^18.3.1",
    "proper-lockfile": "^4.1.2"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/proper-lockfile": "^4.1.4",
    "typescript": "^5.5.0",
    "husky": "^9.0.0",
    "ink-testing-library": "^4.0.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": false,
    "resolveJsonModule": true,
    "types": ["bun-types"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Update .gitignore**

```
node_modules/
.superpowers/
tests/tmp/
*.log
.DS_Store
```

- [ ] **Step 5: Create directory structure**

```bash
mkdir -p src/core/hooks src/commands src/picker/hooks
mkdir -p tests/core/hooks tests/commands tests/picker tests/helpers
```

- [ ] **Step 6: Install dependencies**

```bash
bun install
```

Expected: `node_modules/` created, `bun.lockb` generated.

- [ ] **Step 7: Create minimal cli.ts to verify build**

Create `src/cli.ts`:

```ts
const version = "0.2.0";

function main(): void {
  const cmd = process.argv[2] ?? "help";
  if (cmd === "version" || cmd === "--version" || cmd === "-v") {
    console.log(`claude-watch v${version}`);
  } else {
    console.log(`claude-watch v${version} — run 'claude-watch help' for usage`);
  }
}

main();
```

- [ ] **Step 8: Verify build works**

```bash
bun run build
node dist/cli.js version
```

Expected: `claude-watch v0.2.0`

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json .gitignore bun.lockb src/cli.ts dist/cli.js
git rm CLAUDE.md config.example.json hooks/session-start
git rm -r skills/watchdog
git commit -m "scaffold: TS project with bun build, delete old bash files"
```

---

### Task 2: Core — slug module

**Files:**
- Create: `src/core/slug.ts`
- Test: `tests/core/slug.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/core/slug.test.ts`:

```ts
import { describe, test, expect } from "bun:test";
import { pathToSlug, slugToPath, cwdToTmuxName } from "../../src/core/slug";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("pathToSlug", () => {
  test("converts basic path", () => {
    expect(pathToSlug("/home/user/project")).toBe("-home-user-project");
  });

  test("handles dots (becomes dash)", () => {
    expect(pathToSlug("/home/user/.config/app")).toBe("-home-user--config-app");
  });

  test("handles consecutive dots", () => {
    expect(pathToSlug("/home/user/.openclaw/workspace")).toBe(
      "-home-user--openclaw-workspace"
    );
  });

  test("handles trailing slash", () => {
    expect(pathToSlug("/home/user/project/")).toBe("-home-user-project");
  });
});

describe("slugToPath", () => {
  let root: string;

  function setup(dirs: string[]): void {
    root = mkdtempSync(join(tmpdir(), "slug-test-"));
    for (const d of dirs) {
      mkdirSync(join(root, d), { recursive: true });
    }
  }

  function teardown(): void {
    rmSync(root, { recursive: true, force: true });
  }

  test("reverses a simple path", () => {
    setup(["home/user/project"]);
    const slug = "-home-user-project";
    expect(slugToPath(slug, root)).toBe(join(root, "home/user/project"));
    teardown();
  });

  test("resolves dot-prefix ambiguity via filesystem probe", () => {
    setup(["home/user/.openclaw/workspace"]);
    const slug = "-home-user--openclaw-workspace";
    expect(slugToPath(slug, root)).toBe(
      join(root, "home/user/.openclaw/workspace")
    );
    teardown();
  });

  test("returns null when path does not exist", () => {
    setup([]);
    expect(slugToPath("-totally-nonexistent-dir", root)).toBeNull();
    teardown();
  });
});

describe("cwdToTmuxName", () => {
  test("prefixes slug with claude-", () => {
    expect(cwdToTmuxName("/home/user/project")).toBe("claude--home-user-project");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/core/slug.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement slug module**

Create `src/core/slug.ts`:

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";

const KNOWN_DOT_PREFIXES = [
  "openclaw", "claude", "config", "local", "ssh", "npm", "nvm", "bun",
  "cargo", "rustup", "docker", "kube", "gnupg",
];

export function pathToSlug(cwd: string): string {
  const normalized = cwd.replace(/\/+$/, "");
  return normalized.replace(/^\//, "-").replace(/[/.]/g, "-");
}

export function slugToPath(
  slug: string,
  fsRoot: string = "/"
): string | null {
  const candidate = slug.replace(/^-/, "/").replace(/-/g, "/");
  const full = fsRoot === "/" ? candidate : join(fsRoot, candidate.slice(1));

  if (existsSync(full)) return full;

  for (const prefix of KNOWN_DOT_PREFIXES) {
    const pattern = new RegExp(`/${prefix}`, "g");
    const dotted = candidate.replace(pattern, `/.${prefix}`);
    const fullDotted =
      fsRoot === "/" ? dotted : join(fsRoot, dotted.slice(1));
    if (existsSync(fullDotted)) return fullDotted;
  }

  return null;
}

export function cwdToTmuxName(cwd: string): string {
  return `claude-${pathToSlug(cwd)}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/core/slug.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/slug.ts tests/core/slug.test.ts
git commit -m "feat: add slug module — path↔slug conversion with dot-prefix probing"
```

---

### Task 3: Core — config, log, notices

**Files:**
- Create: `src/core/config.ts`, `src/core/log.ts`, `src/core/notices.ts`
- Test: `tests/core/config.test.ts`, `tests/core/log.test.ts`, `tests/core/notices.test.ts`

- [ ] **Step 1: Write failing config tests**

Create `tests/core/config.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig, getConfigDir, getProjectsDir } from "../../src/core/config";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("config", () => {
  let dir: string;
  const origEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "config-test-"));
    origEnv.CLAUDE_WATCH_CONFIG_DIR = process.env.CLAUDE_WATCH_CONFIG_DIR;
    origEnv.CLAUDE_WATCH_PROJECTS_DIR = process.env.CLAUDE_WATCH_PROJECTS_DIR;
    process.env.CLAUDE_WATCH_CONFIG_DIR = dir;
  });

  afterEach(() => {
    process.env.CLAUDE_WATCH_CONFIG_DIR = origEnv.CLAUDE_WATCH_CONFIG_DIR;
    process.env.CLAUDE_WATCH_PROJECTS_DIR = origEnv.CLAUDE_WATCH_PROJECTS_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns defaults when no config file", () => {
    const cfg = loadConfig();
    expect(cfg.peekLines).toBe(7);
    expect(cfg.pageSize).toBe(10);
    expect(cfg.remoteControl).toBe(true);
    expect(cfg.resume).toBe(true);
  });

  test("merges config file values with defaults", () => {
    writeFileSync(join(dir, "config.json"), JSON.stringify({ peekLines: 20 }));
    const cfg = loadConfig();
    expect(cfg.peekLines).toBe(20);
    expect(cfg.pageSize).toBe(10);
  });

  test("handles malformed config gracefully", () => {
    writeFileSync(join(dir, "config.json"), "not json");
    const cfg = loadConfig();
    expect(cfg.peekLines).toBe(7);
  });

  test("getConfigDir respects env override", () => {
    expect(getConfigDir()).toBe(dir);
  });

  test("getProjectsDir respects env override", () => {
    process.env.CLAUDE_WATCH_PROJECTS_DIR = "/custom/projects";
    expect(getProjectsDir()).toBe("/custom/projects");
  });

  test("getProjectsDir defaults to ~/.claude/projects", () => {
    delete process.env.CLAUDE_WATCH_PROJECTS_DIR;
    const result = getProjectsDir();
    expect(result).toMatch(/\.claude\/projects$/);
  });
});
```

- [ ] **Step 2: Implement config module**

Create `src/core/config.ts`:

```ts
import { readFileSync, existsSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface Config {
  peekLines: number;
  pageSize: number;
  remoteControl: boolean;
  resume: boolean;
}

const DEFAULTS: Config = {
  peekLines: 7,
  pageSize: 10,
  remoteControl: true,
  resume: true,
};

export function getConfigDir(): string {
  return process.env.CLAUDE_WATCH_CONFIG_DIR ?? join(homedir(), ".claude-watch");
}

export function getProjectsDir(): string {
  if (process.env.CLAUDE_WATCH_PROJECTS_DIR) {
    return process.env.CLAUDE_WATCH_PROJECTS_DIR;
  }
  const claudeHome = process.env.CLAUDE_HOME ?? join(homedir(), ".claude");
  return join(claudeHome, "projects");
}

export function ensureConfigDir(): void {
  mkdirSync(getConfigDir(), { recursive: true });
}

export function loadConfig(): Config {
  const configPath = join(getConfigDir(), "config.json");
  if (!existsSync(configPath)) return { ...DEFAULTS };

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      peekLines: typeof parsed.peekLines === "number" ? parsed.peekLines : DEFAULTS.peekLines,
      pageSize: typeof parsed.pageSize === "number" ? parsed.pageSize : DEFAULTS.pageSize,
      remoteControl: typeof parsed.remoteControl === "boolean" ? parsed.remoteControl : DEFAULTS.remoteControl,
      resume: typeof parsed.resume === "boolean" ? parsed.resume : DEFAULTS.resume,
    };
  } catch {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    renameSync(configPath, `${configPath}.broken-${ts}`);
    return { ...DEFAULTS };
  }
}
```

- [ ] **Step 3: Run config tests**

```bash
bun test tests/core/config.test.ts
```

Expected: PASS.

- [ ] **Step 4: Write log module + tests**

Create `src/core/log.ts`:

```ts
import { appendFileSync, existsSync, statSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "./config.js";

type Level = "debug" | "info" | "notice" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = {
  debug: 0, info: 1, notice: 2, warn: 3, error: 4,
};

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_ROTATIONS = 3;

function getLogPath(): string {
  return join(getConfigDir(), "claude-watch.log");
}

function isDebugEnabled(): boolean {
  return process.env.CLAUDE_WATCH_DEBUG === "1";
}

function shouldLog(level: Level): boolean {
  const minLevel: Level = isDebugEnabled() ? "debug" : "info";
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

function rotate(logPath: string): void {
  try {
    if (!existsSync(logPath)) return;
    const stat = statSync(logPath);
    if (stat.size < MAX_LOG_SIZE) return;

    for (let i = MAX_ROTATIONS - 1; i >= 1; i--) {
      const from = `${logPath}.${i}`;
      const to = `${logPath}.${i + 1}`;
      if (existsSync(from)) renameSync(from, to);
    }
    renameSync(logPath, `${logPath}.1`);
    writeFileSync(logPath, "");
  } catch {
    // rotation failure is non-critical
  }
}

export function log(level: Level, message: string): void {
  if (!shouldLog(level)) return;
  const logPath = getLogPath();
  const ts = new Date().toISOString();
  const line = `${ts} [${level.toUpperCase()}] ${message}\n`;

  try {
    rotate(logPath);
    appendFileSync(logPath, line);
  } catch {
    // logging failure is non-critical
  }

  if (level === "error" || level === "warn") {
    process.stderr.write(`claude-watch: ${level}: ${message}\n`);
  }
}
```

Create `tests/core/log.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { log } from "../../src/core/log";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("log", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "log-test-"));
    process.env.CLAUDE_WATCH_CONFIG_DIR = dir;
  });

  afterEach(() => {
    delete process.env.CLAUDE_WATCH_CONFIG_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  test("writes info-level log to file", () => {
    log("info", "test message");
    const logPath = join(dir, "claude-watch.log");
    expect(existsSync(logPath)).toBe(true);
    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[INFO] test message");
  });

  test("skips debug when CLAUDE_WATCH_DEBUG is not set", () => {
    delete process.env.CLAUDE_WATCH_DEBUG;
    log("debug", "hidden message");
    const logPath = join(dir, "claude-watch.log");
    if (existsSync(logPath)) {
      expect(readFileSync(logPath, "utf-8")).not.toContain("hidden");
    }
  });
});
```

- [ ] **Step 5: Write notices module + tests**

Create `src/core/notices.ts`:

```ts
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "./config.js";

export interface Notice {
  timestamp: string;
  severity: "warn" | "notice";
  message: string;
}

function getNoticesPath(): string {
  return join(getConfigDir(), "notices");
}

export function addNotice(severity: "warn" | "notice", message: string): void {
  const entry: Notice = {
    timestamp: new Date().toISOString(),
    severity,
    message,
  };
  try {
    appendFileSync(getNoticesPath(), JSON.stringify(entry) + "\n");
  } catch {
    // non-critical
  }
}

export function readAndClearNotices(): Notice[] {
  const path = getNoticesPath();
  if (!existsSync(path)) return [];

  try {
    const raw = readFileSync(path, "utf-8").trim();
    if (!raw) return [];
    writeFileSync(path, "");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Notice);
  } catch {
    return [];
  }
}
```

Create `tests/core/notices.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { addNotice, readAndClearNotices } from "../../src/core/notices";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("notices", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "notice-test-"));
    process.env.CLAUDE_WATCH_CONFIG_DIR = dir;
  });

  afterEach(() => {
    delete process.env.CLAUDE_WATCH_CONFIG_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  test("add and read notices", () => {
    addNotice("warn", "session recovered from backup");
    addNotice("notice", "pruned stale entry");
    const notices = readAndClearNotices();
    expect(notices).toHaveLength(2);
    expect(notices[0].severity).toBe("warn");
    expect(notices[0].message).toBe("session recovered from backup");
  });

  test("read clears notices", () => {
    addNotice("warn", "test");
    readAndClearNotices();
    expect(readAndClearNotices()).toHaveLength(0);
  });

  test("returns empty array when no notices file", () => {
    expect(readAndClearNotices()).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Run all tests**

```bash
bun test tests/core/config.test.ts tests/core/log.test.ts tests/core/notices.test.ts
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/config.ts src/core/log.ts src/core/notices.ts
git add tests/core/config.test.ts tests/core/log.test.ts tests/core/notices.test.ts
git commit -m "feat: add config, log, notices modules with tests"
```

---

### Task 4: Test fixture helper

**Files:**
- Create: `tests/helpers/fixture.ts`

- [ ] **Step 1: Create fixture helper**

Create `tests/helpers/fixture.ts`:

```ts
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface Fixture {
  root: string;
  projectsDir: string;
  stateDir: string;
  addSession(cwd: string, jsonlId: string, events: object[]): string;
  addWatched(entries: WatchedEntry[]): void;
  readWatched(): { version: number; entries: WatchedEntry[] };
  setEnv(): void;
  restoreEnv(): void;
  cleanup(): void;
}

export interface WatchedEntry {
  cwd: string;
  pinnedJsonl: string | null;
  pinnedAt: string;
}

export function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "cw-fixture-"));
  const projectsDir = join(root, ".claude/projects");
  const stateDir = join(root, ".claude-watch");
  mkdirSync(projectsDir, { recursive: true });
  mkdirSync(stateDir, { recursive: true });

  const savedEnv: Record<string, string | undefined> = {};

  return {
    root,
    projectsDir,
    stateDir,

    addSession(cwd: string, jsonlId: string, events: object[]): string {
      const slug = cwd.replace(/^\//, "-").replace(/[/.]/g, "-");
      const slugDir = join(projectsDir, slug);
      mkdirSync(slugDir, { recursive: true });

      // ensure the cwd directory exists for slug reversal
      const cwdInFixture = join(root, cwd.slice(1));
      mkdirSync(cwdInFixture, { recursive: true });

      const jsonlPath = join(slugDir, `${jsonlId}.jsonl`);
      const content = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
      writeFileSync(jsonlPath, content);
      return jsonlPath;
    },

    addWatched(entries: WatchedEntry[]): void {
      writeFileSync(
        join(stateDir, "watched.json"),
        JSON.stringify({ version: 1, entries }, null, 2)
      );
    },

    readWatched(): { version: number; entries: WatchedEntry[] } {
      const raw = readFileSync(join(stateDir, "watched.json"), "utf-8");
      return JSON.parse(raw);
    },

    setEnv(): void {
      savedEnv.CLAUDE_WATCH_CONFIG_DIR = process.env.CLAUDE_WATCH_CONFIG_DIR;
      savedEnv.CLAUDE_WATCH_PROJECTS_DIR = process.env.CLAUDE_WATCH_PROJECTS_DIR;
      process.env.CLAUDE_WATCH_CONFIG_DIR = stateDir;
      process.env.CLAUDE_WATCH_PROJECTS_DIR = projectsDir;
    },

    restoreEnv(): void {
      if (savedEnv.CLAUDE_WATCH_CONFIG_DIR === undefined) {
        delete process.env.CLAUDE_WATCH_CONFIG_DIR;
      } else {
        process.env.CLAUDE_WATCH_CONFIG_DIR = savedEnv.CLAUDE_WATCH_CONFIG_DIR;
      }
      if (savedEnv.CLAUDE_WATCH_PROJECTS_DIR === undefined) {
        delete process.env.CLAUDE_WATCH_PROJECTS_DIR;
      } else {
        process.env.CLAUDE_WATCH_PROJECTS_DIR = savedEnv.CLAUDE_WATCH_PROJECTS_DIR;
      }
    },

    cleanup(): void {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export function makeUserEvent(content: string): object {
  return { type: "human", message: { role: "user", content } };
}

export function makeAssistantEvent(content: string): object {
  return { type: "assistant", message: { role: "assistant", content } };
}

export function makeToolEvent(tool: string, output: string): object {
  return { type: "tool_result", tool_use_id: "t1", name: tool, content: output };
}
```

- [ ] **Step 2: Commit**

```bash
git add tests/helpers/fixture.ts
git commit -m "test: add fixture helper for temp dir-based integration tests"
```

---

### Task 5: Core — sessions module

**Files:**
- Create: `src/core/sessions.ts`
- Test: `tests/core/sessions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/core/sessions.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { loadSessions, extractPeek, validateJsonl } from "../../src/core/sessions";
import { makeFixture, makeUserEvent, makeAssistantEvent, type Fixture } from "../helpers/fixture";

describe("sessions", () => {
  let f: Fixture;

  beforeEach(() => {
    f = makeFixture();
    f.setEnv();
  });

  afterEach(() => {
    f.restoreEnv();
    f.cleanup();
  });

  test("loadSessions returns sessions sorted by mtime desc", async () => {
    f.addSession("/home/user/projectA", "aaa-111", [
      makeUserEvent("hello project A"),
    ]);
    // small delay so mtime differs
    await Bun.sleep(10);
    f.addSession("/home/user/projectB", "bbb-222", [
      makeUserEvent("hello project B"),
    ]);

    const sessions = await loadSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].jsonlId).toBe("bbb-222");
    expect(sessions[1].jsonlId).toBe("aaa-111");
  });

  test("loadSessions extracts lastEvent from tail of jsonl", async () => {
    f.addSession("/home/user/proj", "ccc-333", [
      makeUserEvent("first message"),
      makeAssistantEvent("last message here"),
    ]);

    const sessions = await loadSessions();
    expect(sessions[0].lastEvent).toContain("last message here");
  });

  test("loadSessions returns cwd via slug reversal", async () => {
    f.addSession("/home/user/proj", "ddd-444", [makeUserEvent("hi")]);
    const sessions = await loadSessions();
    expect(sessions[0].cwd).toBe(`${f.root}/home/user/proj`);
  });

  test("extractPeek returns last N events", async () => {
    const events = [
      makeUserEvent("one"),
      makeAssistantEvent("two"),
      makeUserEvent("three"),
      makeAssistantEvent("four"),
      makeUserEvent("five"),
    ];
    const path = f.addSession("/home/user/peek", "eee-555", events);
    const peek = await extractPeek(path, 3);
    expect(peek).toHaveLength(3);
    expect(peek[0]).toContain("three");
    expect(peek[2]).toContain("five");
  });

  test("validateJsonl returns true for valid file", () => {
    const path = f.addSession("/home/user/valid", "fff-666", [
      makeUserEvent("valid"),
    ]);
    expect(validateJsonl(path)).toBe(true);
  });

  test("validateJsonl returns false for malformed file", () => {
    const path = f.addSession("/home/user/bad", "ggg-777", []);
    const { writeFileSync } = require("node:fs");
    writeFileSync(path, "not json\n");
    expect(validateJsonl(path)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

```bash
bun test tests/core/sessions.test.ts
```

- [ ] **Step 3: Implement sessions module**

Create `src/core/sessions.ts`:

```ts
import {
  readdirSync, readFileSync, statSync, existsSync,
} from "node:fs";
import { join, basename } from "node:path";
import { getProjectsDir } from "./config.js";
import { slugToPath } from "./slug.js";

export interface Session {
  jsonlPath: string;
  jsonlId: string;
  slug: string;
  cwd: string | null;
  mtime: Date;
  lastEvent: string;
  isWatched: boolean;
  isAlive: boolean;
}

export async function loadSessions(): Promise<Session[]> {
  const projectsDir = getProjectsDir();
  if (!existsSync(projectsDir)) return [];

  const sessions: Session[] = [];

  for (const slugDir of readdirSync(projectsDir)) {
    const slugPath = join(projectsDir, slugDir);
    const stat = statSync(slugPath, { throwIfNoEntry: false });
    if (!stat?.isDirectory()) continue;

    let jsonls: string[];
    try {
      jsonls = readdirSync(slugPath).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }

    for (const jsonlFile of jsonls) {
      const jsonlPath = join(slugPath, jsonlFile);
      const jsonlStat = statSync(jsonlPath, { throwIfNoEntry: false });
      if (!jsonlStat) continue;

      const jsonlId = basename(jsonlFile, ".jsonl");
      const cwd = slugToPath(slugDir);

      sessions.push({
        jsonlPath,
        jsonlId,
        slug: slugDir,
        cwd,
        mtime: jsonlStat.mtime,
        lastEvent: extractLastEvent(jsonlPath),
        isWatched: false, // filled in by caller
        isAlive: false,   // filled in by caller
      });
    }
  }

  sessions.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return sessions;
}

function extractLastEvent(jsonlPath: string): string {
  try {
    const content = readFileSync(jsonlPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return "";

    const last = JSON.parse(lines[lines.length - 1]);
    return renderEvent(last).slice(0, 100);
  } catch {
    return "";
  }
}

export async function extractPeek(
  jsonlPath: string,
  count: number
): Promise<string[]> {
  try {
    const content = readFileSync(jsonlPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const tail = lines.slice(-count);
    return tail.map((line) => {
      try {
        return renderEvent(JSON.parse(line));
      } catch {
        return line.slice(0, 100);
      }
    });
  } catch {
    return [];
  }
}

function renderEvent(event: Record<string, unknown>): string {
  if (event.message && typeof event.message === "object") {
    const msg = event.message as Record<string, unknown>;
    const role = String(msg.role ?? "unknown");
    const content = typeof msg.content === "string"
      ? msg.content
      : JSON.stringify(msg.content);
    return `${role}: ${content.replace(/\n/g, " ")}`;
  }
  if (event.name && event.content) {
    return `tool(${event.name}): ${String(event.content).replace(/\n/g, " ")}`;
  }
  return JSON.stringify(event).slice(0, 100);
}

export function validateJsonl(jsonlPath: string): boolean {
  try {
    const content = readFileSync(jsonlPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return false;
    JSON.parse(lines[lines.length - 1]);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/core/sessions.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/sessions.ts tests/core/sessions.test.ts
git commit -m "feat: add sessions module — jsonl discovery, last-event extraction, validation"
```

---

### Task 6: Core — tmux driver

**Files:**
- Create: `src/core/tmux.ts`
- Test: `tests/core/tmux.test.ts`

- [ ] **Step 1: Write tests**

Create `tests/core/tmux.test.ts`:

```ts
import { describe, test, expect } from "bun:test";
import { MockTmuxDriver } from "../../src/core/tmux";

describe("MockTmuxDriver", () => {
  test("tracks session lifecycle", () => {
    const driver = new MockTmuxDriver();
    expect(driver.hasSession("test")).toBe(false);

    driver.newSession("test", "/tmp", "echo hi");
    expect(driver.hasSession("test")).toBe(true);
    expect(driver.sessions.get("test")).toEqual({
      cwd: "/tmp",
      cmd: "echo hi",
      keys: [],
      paneContent: "",
    });

    driver.killSession("test");
    expect(driver.hasSession("test")).toBe(false);
  });

  test("sendKeys records sent keys", () => {
    const driver = new MockTmuxDriver();
    driver.newSession("test", "/tmp", "echo hi");
    driver.sendKeys("test", "/remote-control");
    driver.sendKeys("test", "Enter");
    expect(driver.sessions.get("test")!.keys).toEqual([
      "/remote-control",
      "Enter",
    ]);
  });
});
```

- [ ] **Step 2: Implement tmux module**

Create `src/core/tmux.ts`:

```ts
import { execFileSync } from "node:child_process";

export interface TmuxDriver {
  hasSession(name: string): boolean;
  newSession(name: string, cwd: string, cmd: string): void;
  killSession(name: string): void;
  sendKeys(name: string, keys: string): void;
  capturePane(name: string): string;
  listSessions(): string[];
}

export class RealTmuxDriver implements TmuxDriver {
  hasSession(name: string): boolean {
    try {
      execFileSync("tmux", ["has-session", "-t", name], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  newSession(name: string, cwd: string, cmd: string): void {
    execFileSync("tmux", ["new-session", "-d", "-s", name, "-c", cwd, cmd], {
      stdio: "ignore",
    });
  }

  killSession(name: string): void {
    try {
      execFileSync("tmux", ["kill-session", "-t", name], { stdio: "ignore" });
    } catch {
      // session may already be dead
    }
  }

  sendKeys(name: string, keys: string): void {
    execFileSync("tmux", ["send-keys", "-t", name, keys, "Enter"], {
      stdio: "ignore",
    });
  }

  capturePane(name: string): string {
    try {
      return execFileSync("tmux", ["capture-pane", "-t", name, "-p"], {
        encoding: "utf-8",
      });
    } catch {
      return "";
    }
  }

  listSessions(): string[] {
    try {
      const out = execFileSync("tmux", ["ls", "-F", "#{session_name}"], {
        encoding: "utf-8",
      });
      return out.trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }
}

interface MockSession {
  cwd: string;
  cmd: string;
  keys: string[];
  paneContent: string;
}

export class MockTmuxDriver implements TmuxDriver {
  sessions = new Map<string, MockSession>();

  hasSession(name: string): boolean {
    return this.sessions.has(name);
  }

  newSession(name: string, cwd: string, cmd: string): void {
    this.sessions.set(name, { cwd, cmd, keys: [], paneContent: "" });
  }

  killSession(name: string): void {
    this.sessions.delete(name);
  }

  sendKeys(name: string, keys: string): void {
    const s = this.sessions.get(name);
    if (s) s.keys.push(keys);
  }

  capturePane(name: string): string {
    return this.sessions.get(name)?.paneContent ?? "";
  }

  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}

let _driver: TmuxDriver | null = null;

export function setTmuxDriver(driver: TmuxDriver): void {
  _driver = driver;
}

export function getTmuxDriver(): TmuxDriver {
  if (!_driver) _driver = new RealTmuxDriver();
  return _driver;
}
```

- [ ] **Step 3: Run tests**

```bash
bun test tests/core/tmux.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/core/tmux.ts tests/core/tmux.test.ts
git commit -m "feat: add tmux driver — TmuxDriver interface with real and mock implementations"
```

---

### Task 7: Core — state module

**Files:**
- Create: `src/core/state.ts`
- Test: `tests/core/state.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/core/state.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  loadState, saveState, addEntry, removeEntry,
  upsertEntry, rollForward, type WatchedState, type WatchedEntry,
} from "../../src/core/state";
import { makeFixture, type Fixture } from "../helpers/fixture";

describe("state", () => {
  let f: Fixture;

  beforeEach(() => {
    f = makeFixture();
    f.setEnv();
  });

  afterEach(() => {
    f.restoreEnv();
    f.cleanup();
  });

  test("loadState returns empty state when no file", () => {
    const state = loadState();
    expect(state.version).toBe(1);
    expect(state.entries).toHaveLength(0);
  });

  test("loadState reads existing watched.json", () => {
    f.addWatched([
      { cwd: "/a", pinnedJsonl: "abc", pinnedAt: "2026-01-01T00:00:00Z" },
    ]);
    const state = loadState();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].cwd).toBe("/a");
  });

  test("saveState + loadState round-trip", () => {
    const state: WatchedState = {
      version: 1,
      entries: [{ cwd: "/b", pinnedJsonl: "def", pinnedAt: "2026-02-01T00:00:00Z" }],
    };
    saveState(state);
    const loaded = loadState();
    expect(loaded).toEqual(state);
  });

  test("addEntry appends to state", () => {
    const state = loadState();
    const entry: WatchedEntry = {
      cwd: "/c", pinnedJsonl: "ghi", pinnedAt: new Date().toISOString(),
    };
    const updated = addEntry(state, entry);
    expect(updated.entries).toHaveLength(1);
    expect(updated.entries[0].cwd).toBe("/c");
  });

  test("removeEntry removes by cwd", () => {
    const state: WatchedState = {
      version: 1,
      entries: [
        { cwd: "/a", pinnedJsonl: "x", pinnedAt: "2026-01-01T00:00:00Z" },
        { cwd: "/b", pinnedJsonl: "y", pinnedAt: "2026-01-01T00:00:00Z" },
      ],
    };
    const updated = removeEntry(state, "/a");
    expect(updated.entries).toHaveLength(1);
    expect(updated.entries[0].cwd).toBe("/b");
  });

  test("upsertEntry updates existing entry by cwd", () => {
    const state: WatchedState = {
      version: 1,
      entries: [
        { cwd: "/a", pinnedJsonl: "old", pinnedAt: "2026-01-01T00:00:00Z" },
      ],
    };
    const updated = upsertEntry(state, {
      cwd: "/a", pinnedJsonl: "new", pinnedAt: "2026-02-01T00:00:00Z",
    });
    expect(updated.entries).toHaveLength(1);
    expect(updated.entries[0].pinnedJsonl).toBe("new");
  });

  test("rollForward picks newer jsonl", () => {
    const entry: WatchedEntry = {
      cwd: "/a", pinnedJsonl: "abc", pinnedAt: "2026-01-01T00:00:00Z",
    };
    const jsonls = [
      { id: "abc", mtime: new Date("2026-01-01") },
      { id: "def", mtime: new Date("2026-02-01") },
    ];
    const result = rollForward(entry, jsonls);
    expect(result.pinnedJsonl).toBe("def");
  });

  test("rollForward no-ops when nothing newer", () => {
    const entry: WatchedEntry = {
      cwd: "/a", pinnedJsonl: "abc", pinnedAt: "2026-03-01T00:00:00Z",
    };
    const jsonls = [{ id: "abc", mtime: new Date("2026-01-01") }];
    const result = rollForward(entry, jsonls);
    expect(result.pinnedJsonl).toBe("abc");
  });
});
```

- [ ] **Step 2: Implement state module**

Create `src/core/state.ts`:

```ts
import {
  readFileSync, writeFileSync, existsSync, renameSync, mkdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { getConfigDir } from "./config.js";
import lockfile from "proper-lockfile";

export interface WatchedEntry {
  cwd: string;
  pinnedJsonl: string | null;
  pinnedAt: string;
}

export interface WatchedState {
  version: number;
  entries: WatchedEntry[];
}

function watchedPath(): string {
  return join(getConfigDir(), "watched.json");
}

function lockPath(): string {
  return join(getConfigDir(), "state.lock");
}

function ensureLockFile(): void {
  const lp = lockPath();
  mkdirSync(dirname(lp), { recursive: true });
  if (!existsSync(lp)) writeFileSync(lp, "");
}

export function loadState(): WatchedState {
  const p = watchedPath();
  if (!existsSync(p)) return { version: 1, entries: [] };

  try {
    const raw = readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      throw new Error("invalid schema");
    }
    return parsed as WatchedState;
  } catch {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    try { renameSync(p, `${p}.broken-${ts}`); } catch { /* ignore */ }
    return { version: 1, entries: [] };
  }
}

export function saveState(state: WatchedState): void {
  const p = watchedPath();
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  renameSync(tmp, p);
}

export function addEntry(state: WatchedState, entry: WatchedEntry): WatchedState {
  return { ...state, entries: [...state.entries, entry] };
}

export function removeEntry(state: WatchedState, cwd: string): WatchedState {
  return { ...state, entries: state.entries.filter((e) => e.cwd !== cwd) };
}

export function upsertEntry(state: WatchedState, entry: WatchedEntry): WatchedState {
  const existing = state.entries.findIndex((e) => e.cwd === entry.cwd);
  if (existing >= 0) {
    const entries = [...state.entries];
    entries[existing] = entry;
    return { ...state, entries };
  }
  return addEntry(state, entry);
}

export function rollForward(
  entry: WatchedEntry,
  jsonls: { id: string; mtime: Date }[]
): WatchedEntry {
  if (entry.pinnedJsonl === null) return entry;

  const pinnedAt = new Date(entry.pinnedAt);
  const newer = jsonls
    .filter((j) => j.mtime > pinnedAt)
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  if (newer.length === 0) return entry;

  return {
    ...entry,
    pinnedJsonl: newer[0].id,
    pinnedAt: newer[0].mtime.toISOString(),
  };
}

export async function withStateLock<T>(fn: () => T | Promise<T>): Promise<T> {
  ensureLockFile();
  const lp = lockPath();
  let release: (() => Promise<void>) | undefined;
  try {
    release = await lockfile.lock(lp, { retries: { retries: 5, minTimeout: 100 } });
    return await fn();
  } finally {
    if (release) await release();
  }
}
```

- [ ] **Step 3: Run tests**

```bash
bun test tests/core/state.test.ts
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/core/state.ts tests/core/state.test.ts
git commit -m "feat: add state module — watched.json CRUD, roll-forward, locking"
```

---

### Task 8: Core — actions (activate, deactivate, new)

**Files:**
- Create: `src/core/actions.ts`
- Test: `tests/core/actions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/core/actions.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { activate, deactivate, createNew } from "../../src/core/actions";
import { loadState } from "../../src/core/state";
import { setTmuxDriver, MockTmuxDriver } from "../../src/core/tmux";
import { makeFixture, makeUserEvent, type Fixture } from "../helpers/fixture";

describe("actions", () => {
  let f: Fixture;
  let mockTmux: MockTmuxDriver;

  beforeEach(() => {
    f = makeFixture();
    f.setEnv();
    mockTmux = new MockTmuxDriver();
    setTmuxDriver(mockTmux);
  });

  afterEach(() => {
    f.restoreEnv();
    f.cleanup();
    setTmuxDriver(null!);
  });

  test("activate adds entry to watched.json", async () => {
    f.addSession("/home/user/proj", "abc-123", [makeUserEvent("hi")]);
    await activate({ cwd: `${f.root}/home/user/proj`, jsonlId: "abc-123" });
    const state = loadState();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].cwd).toBe(`${f.root}/home/user/proj`);
    expect(state.entries[0].pinnedJsonl).toBe("abc-123");
  });

  test("activate starts tmux session", async () => {
    f.addSession("/home/user/proj", "abc-123", [makeUserEvent("hi")]);
    await activate({
      cwd: `${f.root}/home/user/proj`,
      jsonlId: "abc-123",
      remoteControl: false,
    });
    expect(mockTmux.hasSession(`claude--home-user-proj`)).toBe(true);
  });

  test("activate writes sentinel when attach=true", async () => {
    const sentinelPath = `${f.root}/sentinel`;
    process.env.CLAUDE_WATCH_SENTINEL = sentinelPath;
    f.addSession("/home/user/proj", "abc-123", [makeUserEvent("hi")]);
    await activate({
      cwd: `${f.root}/home/user/proj`,
      jsonlId: "abc-123",
      attach: true,
      remoteControl: false,
    });
    const { readFileSync } = require("node:fs");
    expect(readFileSync(sentinelPath, "utf-8")).toContain("claude-");
    delete process.env.CLAUDE_WATCH_SENTINEL;
  });

  test("deactivate removes entry and kills tmux", async () => {
    f.addWatched([
      { cwd: `${f.root}/home/user/proj`, pinnedJsonl: "abc", pinnedAt: "2026-01-01T00:00:00Z" },
    ]);
    mockTmux.newSession("claude--home-user-proj", "/tmp", "echo");
    await deactivate({ cwd: `${f.root}/home/user/proj`, kill: true });
    const state = loadState();
    expect(state.entries).toHaveLength(0);
    expect(mockTmux.hasSession("claude--home-user-proj")).toBe(false);
  });

  test("deactivate with kill=false preserves tmux session", async () => {
    f.addWatched([
      { cwd: `${f.root}/home/user/proj`, pinnedJsonl: "abc", pinnedAt: "2026-01-01T00:00:00Z" },
    ]);
    mockTmux.newSession("claude--home-user-proj", "/tmp", "echo");
    await deactivate({ cwd: `${f.root}/home/user/proj`, kill: false });
    expect(loadState().entries).toHaveLength(0);
    expect(mockTmux.hasSession("claude--home-user-proj")).toBe(true);
  });

  test("createNew adds null-pinned entry and starts tmux", async () => {
    const cwd = `${f.root}/home/user/newproj`;
    await createNew({ cwd, remoteControl: false });
    const state = loadState();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].pinnedJsonl).toBeNull();
    expect(mockTmux.hasSession(`claude--home-user-newproj`)).toBe(true);
  });
});
```

- [ ] **Step 2: Implement actions module**

Create `src/core/actions.ts`:

```ts
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { loadState, saveState, upsertEntry, removeEntry, withStateLock } from "./state.js";
import { getTmuxDriver } from "./tmux.js";
import { cwdToTmuxName, pathToSlug } from "./slug.js";
import { log } from "./log.js";
import { loadConfig } from "./config.js";

interface ActivateOpts {
  cwd: string;
  jsonlId: string;
  attach?: boolean;
  remoteControl?: boolean;
}

interface DeactivateOpts {
  cwd: string;
  kill?: boolean;
  attach?: boolean;
}

interface CreateNewOpts {
  cwd: string;
  attach?: boolean;
  remoteControl?: boolean;
}

function buildClaudeCmd(jsonlId: string | null): string {
  let cmd = "claude --dangerously-skip-permissions --permission-mode bypassPermissions";
  if (jsonlId) {
    cmd += ` --resume ${jsonlId} --fork-session`;
  }
  return cmd;
}

function writeSentinel(tmuxName: string): void {
  const sentinelPath = process.env.CLAUDE_WATCH_SENTINEL;
  if (sentinelPath) {
    writeFileSync(sentinelPath, tmuxName);
  }
}

async function activateRemoteControl(tmuxName: string): Promise<boolean> {
  const driver = getTmuxDriver();
  const maxAttempts = 3;
  const waitSecs = 10;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, waitSecs * 1000));
    driver.sendKeys(tmuxName, "/remote-control");
    await new Promise((r) => setTimeout(r, 3000));

    const pane = driver.capturePane(tmuxName);
    if (/remote.control/i.test(pane)) {
      log("info", `${tmuxName} remote-control confirmed on attempt ${attempt}`);
      return true;
    }
  }

  log("warn", `${tmuxName} remote-control not confirmed after ${maxAttempts} attempts`);
  return false;
}

export async function activate(opts: ActivateOpts): Promise<void> {
  const { cwd, jsonlId, attach = false, remoteControl } = opts;

  if (!existsSync(cwd)) {
    throw new Error(`directory does not exist: ${cwd}`);
  }

  const tmuxName = cwdToTmuxName(cwd);
  const config = loadConfig();
  const enableRC = remoteControl ?? config.remoteControl;

  await withStateLock(() => {
    const state = loadState();
    const updated = upsertEntry(state, {
      cwd,
      pinnedJsonl: jsonlId,
      pinnedAt: new Date().toISOString(),
    });
    saveState(updated);
  });

  const driver = getTmuxDriver();
  if (!driver.hasSession(tmuxName)) {
    const cmd = buildClaudeCmd(jsonlId);
    driver.newSession(tmuxName, cwd, cmd);
    log("info", `${tmuxName} started in ${cwd}`);

    if (enableRC) {
      await activateRemoteControl(tmuxName);
    }
  }

  if (attach) writeSentinel(tmuxName);
}

export async function deactivate(opts: DeactivateOpts): Promise<void> {
  const { cwd, kill = true, attach = false } = opts;
  const tmuxName = cwdToTmuxName(cwd);

  await withStateLock(() => {
    const state = loadState();
    const updated = removeEntry(state, cwd);
    saveState(updated);
  });

  const driver = getTmuxDriver();
  if (kill && driver.hasSession(tmuxName)) {
    driver.killSession(tmuxName);
    log("info", `${tmuxName} killed`);
  }

  if (attach) writeSentinel(tmuxName);
}

export async function createNew(opts: CreateNewOpts): Promise<void> {
  const { cwd, attach = false, remoteControl } = opts;
  const tmuxName = cwdToTmuxName(cwd);
  const config = loadConfig();
  const enableRC = remoteControl ?? config.remoteControl;

  mkdirSync(cwd, { recursive: true });

  await withStateLock(() => {
    const state = loadState();
    const updated = upsertEntry(state, {
      cwd,
      pinnedJsonl: null,
      pinnedAt: new Date().toISOString(),
    });
    saveState(updated);
  });

  const driver = getTmuxDriver();
  if (!driver.hasSession(tmuxName)) {
    const cmd = buildClaudeCmd(null);
    driver.newSession(tmuxName, cwd, cmd);
    log("info", `${tmuxName} started fresh in ${cwd}`);

    if (enableRC) {
      await activateRemoteControl(tmuxName);
    }
  }

  if (attach) writeSentinel(tmuxName);
}
```

- [ ] **Step 3: Run tests**

```bash
bun test tests/core/actions.test.ts
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/core/actions.ts tests/core/actions.test.ts
git commit -m "feat: add actions module — activate, deactivate, createNew with sentinel handoff"
```

---

### Task 9: Core — SessionStart hook

**Files:**
- Create: `src/core/hooks/sessionStart.ts`
- Test: `tests/core/hooks/sessionStart.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/core/hooks/sessionStart.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { sessionStartHook } from "../../../src/core/hooks/sessionStart";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("sessionStartHook", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hook-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns ok when bypassPermissions is set", () => {
    const settingsDir = join(dir, ".claude");
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      join(settingsDir, "settings.json"),
      JSON.stringify({ permissions: { defaultMode: "bypassPermissions" } })
    );

    const result = sessionStartHook({ claudeHome: settingsDir, cwd: dir });
    expect(result.result).toBe("ok");
  });

  test("warns when bypassPermissions is not set", () => {
    const settingsDir = join(dir, ".claude");
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      join(settingsDir, "settings.json"),
      JSON.stringify({ permissions: {} })
    );

    const result = sessionStartHook({ claudeHome: settingsDir, cwd: dir });
    expect(result.result).toBe("warn");
    expect(result.message).toContain("bypassPermissions");
  });

  test("warns when local settings has allow list", () => {
    const settingsDir = join(dir, ".claude");
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      join(settingsDir, "settings.json"),
      JSON.stringify({ permissions: { defaultMode: "bypassPermissions" } })
    );

    const localDir = join(dir, ".claude");
    mkdirSync(localDir, { recursive: true });
    writeFileSync(
      join(localDir, "settings.local.json"),
      JSON.stringify({ permissions: { allow: ["Bash(*)"] } })
    );

    const result = sessionStartHook({ claudeHome: settingsDir, cwd: dir });
    expect(result.result).toBe("warn");
    expect(result.message).toContain("allow");
  });
});
```

- [ ] **Step 2: Implement hook**

Create `src/core/hooks/sessionStart.ts`:

```ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

interface HookInput {
  claudeHome: string;
  cwd: string;
}

interface HookOutput {
  result: "ok" | "warn";
  message?: string;
}

export function sessionStartHook(input: HookInput): HookOutput {
  const warnings: string[] = [];

  const settingsPath = join(input.claudeHome, "settings.json");
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      if (settings?.permissions?.defaultMode !== "bypassPermissions") {
        warnings.push(
          "claude-watch: permissions.defaultMode is not bypassPermissions in settings.json. " +
          "Watched sessions may prompt for permissions on resume."
        );
      }
    } catch {
      // can't read settings — don't warn about it
    }
  }

  const localPath = join(input.cwd, ".claude", "settings.local.json");
  if (existsSync(localPath)) {
    try {
      const local = JSON.parse(readFileSync(localPath, "utf-8"));
      const allowList = local?.permissions?.allow;
      if (Array.isArray(allowList) && allowList.length > 0) {
        warnings.push(
          `claude-watch: ${localPath} has an explicit allow list — ` +
          "it may override the global bypass mode."
        );
      }
    } catch {
      // can't read local settings — don't warn
    }
  }

  if (warnings.length === 0) return { result: "ok" };
  return { result: "warn", message: warnings.join("\n") };
}
```

- [ ] **Step 3: Run tests**

```bash
bun test tests/core/hooks/sessionStart.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/core/hooks/sessionStart.ts tests/core/hooks/sessionStart.test.ts
git commit -m "feat: add SessionStart hook — validates bypassPermissions config"
```

---

### Task 10: CLI dispatcher + dep checker

**Files:**
- Modify: `src/cli.ts`
- Create: `src/commands/_hook.ts`

- [ ] **Step 1: Implement dependency checker + CLI dispatcher**

Rewrite `src/cli.ts`:

```ts
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir, ensureConfigDir } from "./core/config.js";
import { readAndClearNotices } from "./core/notices.js";

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

  // internal hook dispatch — skip dep checks
  if (cmd === "_hook") {
    const { runHook } = await import("./commands/_hook.js");
    runHook(args[0]);
    return;
  }

  // dep check for all user-facing commands except help/version
  if (!["help", "--help", "-h", "version", "--version", "-v"].includes(cmd)) {
    checkDeps();
  }

  // show deferred notices on interactive commands
  if (["pick", "status", "activate", "deactivate", "new", "logs"].includes(cmd)) {
    showNotices();
  }

  switch (cmd) {
    case "pick":
    case undefined: {
      const { runPick } = await import("./commands/pick.js");
      await runPick();
      break;
    }
    case "scan": {
      const { runScan } = await import("./commands/scan.js");
      await runScan();
      break;
    }
    case "status": {
      const { runStatus } = await import("./commands/status.js");
      runStatus();
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
      console.log("claude-watch v0.2.0");
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
```

- [ ] **Step 2: Implement _hook command**

Create `src/commands/_hook.ts`:

```ts
import { homedir } from "node:os";
import { join } from "node:path";
import { sessionStartHook } from "../core/hooks/sessionStart.js";

export function runHook(hookName: string): void {
  if (hookName === "session-start") {
    const claudeHome = join(homedir(), ".claude");
    const cwd = process.env.CLAUDE_CWD ?? process.cwd();
    const result = sessionStartHook({ claudeHome, cwd });
    console.log(JSON.stringify(result));
  } else {
    process.stderr.write(`claude-watch: unknown hook '${hookName}'\n`);
    process.exit(1);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts src/commands/_hook.ts
git commit -m "feat: add CLI dispatcher with dep checker, notice display, hook dispatch"
```

---

### Task 11: Commands — version, help, logs, status

**Files:**
- Create: `src/commands/version.ts`, `src/commands/help.ts`, `src/commands/logs.ts`, `src/commands/status.ts`
- Test: `tests/commands/status.test.ts`

- [ ] **Step 1: Implement simple commands**

Create `src/commands/help.ts`:

```ts
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
```

Create `src/commands/logs.ts`:

```ts
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getConfigDir } from "../core/config.js";

export function runLogs(args: string[]): void {
  const count = parseInt(args[0] ?? "50", 10);
  const logPath = join(getConfigDir(), "claude-watch.log");

  if (!existsSync(logPath)) {
    console.log(`No log file found at ${logPath}`);
    return;
  }

  const content = readFileSync(logPath, "utf-8");
  const lines = content.trim().split("\n");
  const tail = lines.slice(-count);
  console.log(tail.join("\n"));
}
```

Create `src/commands/status.ts`:

```ts
import { loadState } from "../core/state.js";
import { getTmuxDriver } from "../core/tmux.js";
import { cwdToTmuxName } from "../core/slug.js";
import { basename } from "node:path";

export function runStatus(): void {
  const state = loadState();
  const driver = getTmuxDriver();

  if (state.entries.length === 0) {
    console.log("No watched sessions.");
    return;
  }

  console.log(
    `${"SESSION".padEnd(20)} ${"STATUS".padEnd(10)} ${"PINNED".padEnd(14)} DIRECTORY`
  );
  console.log(
    `${"-------".padEnd(20)} ${"------".padEnd(10)} ${"------".padEnd(14)} ---------`
  );

  for (const entry of state.entries) {
    const tmuxName = cwdToTmuxName(entry.cwd);
    const alive = driver.hasSession(tmuxName);
    const status = alive ? "ALIVE" : "DEAD";
    const pinned = entry.pinnedJsonl
      ? entry.pinnedJsonl.slice(0, 8) + "..."
      : "(new)";

    console.log(
      `${basename(entry.cwd).padEnd(20)} ${status.padEnd(10)} ${pinned.padEnd(14)} ${entry.cwd}`
    );
  }
}
```

- [ ] **Step 2: Write status test**

Create `tests/commands/status.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { runStatus } from "../../src/commands/status";
import { setTmuxDriver, MockTmuxDriver } from "../../src/core/tmux";
import { makeFixture, type Fixture } from "../helpers/fixture";

describe("status command", () => {
  let f: Fixture;

  beforeEach(() => {
    f = makeFixture();
    f.setEnv();
    setTmuxDriver(new MockTmuxDriver());
  });

  afterEach(() => {
    f.restoreEnv();
    f.cleanup();
  });

  test("prints no watched sessions when empty", () => {
    const output: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => output.push(args.join(" "));
    runStatus();
    console.log = origLog;
    expect(output[0]).toBe("No watched sessions.");
  });

  test("prints table for watched entries", () => {
    f.addWatched([
      { cwd: "/home/user/proj", pinnedJsonl: "abcdef-123", pinnedAt: "2026-01-01T00:00:00Z" },
    ]);
    const output: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => output.push(args.join(" "));
    runStatus();
    console.log = origLog;
    expect(output.join("\n")).toContain("DEAD");
    expect(output.join("\n")).toContain("abcdef-1...");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
bun test tests/commands/status.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/commands/help.ts src/commands/logs.ts src/commands/status.ts
git add tests/commands/status.test.ts
git commit -m "feat: add help, logs, status commands"
```

---

### Task 12: Commands — activate, deactivate, new, scan

**Files:**
- Create: `src/commands/activate.ts`, `src/commands/deactivate.ts`, `src/commands/new.ts`, `src/commands/scan.ts`
- Test: `tests/commands/scan.test.ts`

- [ ] **Step 1: Implement headless commands**

Create `src/commands/activate.ts`:

```ts
import { resolve } from "node:path";
import { activate } from "../core/actions.js";
import { loadSessions } from "../core/sessions.js";
import { pathToSlug } from "../core/slug.js";

export async function runActivate(args: string[]): Promise<void> {
  const cwdArg = args[0];
  if (!cwdArg) {
    process.stderr.write("Usage: claude-watch activate <directory> [--jsonl <id>]\n");
    process.exit(1);
  }

  const cwd = resolve(cwdArg);
  const jsonlIdx = args.indexOf("--jsonl");
  let jsonlId: string;

  if (jsonlIdx >= 0 && args[jsonlIdx + 1]) {
    jsonlId = args[jsonlIdx + 1];
  } else {
    const sessions = await loadSessions();
    const slug = pathToSlug(cwd);
    const match = sessions.find((s) => s.slug === slug);
    if (!match) {
      process.stderr.write(`No session found for ${cwd}. Use 'claude-watch new' for a fresh session.\n`);
      process.exit(1);
    }
    jsonlId = match.jsonlId;
  }

  await activate({ cwd, jsonlId });
  console.log(`Activated ${cwd} (pinned ${jsonlId.slice(0, 8)}...)`);
}
```

Create `src/commands/deactivate.ts`:

```ts
import { resolve } from "node:path";
import { deactivate } from "../core/actions.js";

export async function runDeactivate(args: string[]): Promise<void> {
  const cwdArg = args[0];
  if (!cwdArg) {
    process.stderr.write("Usage: claude-watch deactivate <directory> [--no-kill]\n");
    process.exit(1);
  }

  const cwd = resolve(cwdArg);
  const noKill = args.includes("--no-kill");

  await deactivate({ cwd, kill: !noKill });
  console.log(`Deactivated ${cwd}${noKill ? " (tmux preserved)" : ""}`);
}
```

Create `src/commands/new.ts`:

```ts
import { resolve } from "node:path";
import { createNew } from "../core/actions.js";

export async function runNew(args: string[]): Promise<void> {
  const cwdArg = args[0];
  if (!cwdArg) {
    process.stderr.write("Usage: claude-watch new <directory>\n");
    process.exit(1);
  }

  const cwd = resolve(cwdArg);
  await createNew({ cwd });
  console.log(`Created new watched session at ${cwd}`);
}
```

- [ ] **Step 2: Implement scan command**

Create `src/commands/scan.ts`:

```ts
import { readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { loadState, saveState, rollForward, upsertEntry, removeEntry, withStateLock } from "../core/state.js";
import { getTmuxDriver } from "../core/tmux.js";
import { cwdToTmuxName, pathToSlug } from "../core/slug.js";
import { validateJsonl } from "../core/sessions.js";
import { getProjectsDir, loadConfig } from "../core/config.js";
import { log } from "../core/log.js";
import { addNotice } from "../core/notices.js";
import { existsSync, renameSync } from "node:fs";

export async function runScan(): Promise<void> {
  let alive = 0;
  let revived = 0;
  let pruned = 0;

  await withStateLock(async () => {
    let state = loadState();
    const driver = getTmuxDriver();
    const config = loadConfig();
    const entriesToKeep: typeof state.entries = [];

    for (const entry of state.entries) {
      if (!existsSync(entry.cwd)) {
        pruned++;
        addNotice("notice", `Pruned stale entry: ${entry.cwd} (directory no longer exists)`);
        continue;
      }

      // roll forward
      const slug = pathToSlug(entry.cwd);
      const slugDir = join(getProjectsDir(), slug);
      const jsonls = getJsonlsInSlug(slugDir);
      const rolled = rollForward(entry, jsonls);

      const tmuxName = cwdToTmuxName(entry.cwd);

      if (driver.hasSession(tmuxName)) {
        alive++;
        entriesToKeep.push(rolled);
        continue;
      }

      // session is dead — revive
      revived++;

      if (rolled.pinnedJsonl === null) {
        // brand-new session, start fresh
        const cmd = "claude --dangerously-skip-permissions --permission-mode bypassPermissions";
        driver.newSession(tmuxName, entry.cwd, cmd);
        log("info", `${tmuxName} started fresh (new session)`);
      } else {
        // try to resume from the pinned jsonl
        const jsonlPath = join(slugDir, `${rolled.pinnedJsonl}.jsonl`);

        if (existsSync(jsonlPath) && validateJsonl(jsonlPath)) {
          const cmd = `claude --dangerously-skip-permissions --permission-mode bypassPermissions --resume ${rolled.pinnedJsonl} --fork-session`;
          driver.newSession(tmuxName, entry.cwd, cmd);
          log("info", `${tmuxName} resumed from ${rolled.pinnedJsonl}`);
        } else {
          // pinned is broken — try fallback chain
          log("warn", `${tmuxName} pinned jsonl is invalid, trying fallbacks`);

          if (existsSync(jsonlPath)) {
            const ts = new Date().toISOString().replace(/[:.]/g, "-");
            renameSync(jsonlPath, `${jsonlPath}.broken-${ts}`);
          }

          const fallback = jsonls
            .filter((j) => j.id !== rolled.pinnedJsonl)
            .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
            .find((j) => {
              const p = join(slugDir, `${j.id}.jsonl`);
              return validateJsonl(p);
            });

          if (fallback) {
            rolled.pinnedJsonl = fallback.id;
            rolled.pinnedAt = fallback.mtime.toISOString();
            const cmd = `claude --dangerously-skip-permissions --permission-mode bypassPermissions --resume ${fallback.id} --fork-session`;
            driver.newSession(tmuxName, entry.cwd, cmd);
            addNotice("warn", `${basename(entry.cwd)}: recovered from fallback session (pinned was malformed)`);
            log("warn", `${tmuxName} recovered from fallback ${fallback.id}`);
          } else {
            const cmd = "claude --dangerously-skip-permissions --permission-mode bypassPermissions";
            driver.newSession(tmuxName, entry.cwd, cmd);
            addNotice("warn", `${basename(entry.cwd)}: no recoverable session — started fresh`);
            log("warn", `${tmuxName} no recoverable jsonl, started fresh`);
          }
        }
      }

      // remote control activation
      if (config.remoteControl) {
        activateRemoteControlAsync(tmuxName);
      }

      entriesToKeep.push(rolled);
    }

    state = { ...state, entries: entriesToKeep };
    saveState(state);
  });

  if (revived > 0 || pruned > 0) {
    log("info", `scan: ${alive} alive, ${revived} revived, ${pruned} pruned`);
  }
}

function getJsonlsInSlug(slugDir: string): { id: string; mtime: Date }[] {
  if (!existsSync(slugDir)) return [];
  try {
    return readdirSync(slugDir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => {
        const p = join(slugDir, f);
        const s = statSync(p);
        return { id: basename(f, ".jsonl"), mtime: s.mtime };
      });
  } catch {
    return [];
  }
}

function activateRemoteControlAsync(tmuxName: string): void {
  // fire-and-forget — runs in background
  const driver = getTmuxDriver();
  setTimeout(async () => {
    const maxAttempts = 3;
    for (let i = 1; i <= maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 10_000));
      driver.sendKeys(tmuxName, "/remote-control");
      await new Promise((r) => setTimeout(r, 3_000));
      const pane = driver.capturePane(tmuxName);
      if (/remote.control/i.test(pane)) {
        log("info", `${tmuxName} remote-control confirmed`);
        return;
      }
    }
    log("warn", `${tmuxName} remote-control not confirmed after ${maxAttempts} attempts`);
  }, 0);
}
```

- [ ] **Step 3: Write scan test**

Create `tests/commands/scan.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { runScan } from "../../src/commands/scan";
import { loadState } from "../../src/core/state";
import { setTmuxDriver, MockTmuxDriver } from "../../src/core/tmux";
import { makeFixture, makeUserEvent, type Fixture } from "../helpers/fixture";

describe("scan command", () => {
  let f: Fixture;
  let mockTmux: MockTmuxDriver;

  beforeEach(() => {
    f = makeFixture();
    f.setEnv();
    mockTmux = new MockTmuxDriver();
    setTmuxDriver(mockTmux);
  });

  afterEach(() => {
    f.restoreEnv();
    f.cleanup();
  });

  test("revives dead watched session", async () => {
    f.addSession("/home/user/proj", "abc-123", [makeUserEvent("hi")]);
    f.addWatched([
      { cwd: `${f.root}/home/user/proj`, pinnedJsonl: "abc-123", pinnedAt: "2026-01-01T00:00:00Z" },
    ]);

    await runScan();

    const tmuxName = "claude--home-user-proj";
    expect(mockTmux.hasSession(tmuxName)).toBe(true);
    const session = mockTmux.sessions.get(tmuxName)!;
    expect(session.cmd).toContain("--resume abc-123");
  });

  test("skips alive sessions", async () => {
    f.addSession("/home/user/proj", "abc-123", [makeUserEvent("hi")]);
    f.addWatched([
      { cwd: `${f.root}/home/user/proj`, pinnedJsonl: "abc-123", pinnedAt: "2026-01-01T00:00:00Z" },
    ]);
    mockTmux.newSession("claude--home-user-proj", "/tmp", "echo");

    await runScan();

    // session wasn't killed and re-created
    expect(mockTmux.sessions.get("claude--home-user-proj")!.cmd).toBe("echo");
  });

  test("prunes entries for deleted cwds", async () => {
    f.addWatched([
      { cwd: "/nonexistent/path", pinnedJsonl: "xyz", pinnedAt: "2026-01-01T00:00:00Z" },
    ]);

    await runScan();

    const state = loadState();
    expect(state.entries).toHaveLength(0);
  });

  test("rolls forward to newer jsonl", async () => {
    f.addSession("/home/user/proj", "old-111", [makeUserEvent("old")]);
    await Bun.sleep(10);
    f.addSession("/home/user/proj", "new-222", [makeUserEvent("new")]);

    f.addWatched([
      { cwd: `${f.root}/home/user/proj`, pinnedJsonl: "old-111", pinnedAt: "2020-01-01T00:00:00Z" },
    ]);

    await runScan();

    const state = loadState();
    expect(state.entries[0].pinnedJsonl).toBe("new-222");
  });
});
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/commands/scan.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/activate.ts src/commands/deactivate.ts src/commands/new.ts src/commands/scan.ts
git add tests/commands/scan.test.ts
git commit -m "feat: add activate, deactivate, new, scan commands with scan tests"
```

---

### Task 13: Commands — install, uninstall

**Files:**
- Create: `src/commands/install.ts`, `src/commands/uninstall.ts`
- Test: `tests/commands/install.test.ts`

- [ ] **Step 1: Implement install**

Create `src/commands/install.ts`:

```ts
import { execFileSync, execSync } from "node:child_process";
import { copyFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { getConfigDir } from "../core/config.js";
import { log } from "../core/log.js";

function getPluginDir(): string {
  return resolve(dirname(dirname(new URL(import.meta.url).pathname)));
}

export function runInstall(): void {
  const configDir = getConfigDir();
  const pluginDir = getPluginDir();

  // create stable install dirs
  const stableBin = join(configDir, "bin");
  const stableDist = join(configDir, "dist");
  mkdirSync(stableBin, { recursive: true });
  mkdirSync(stableDist, { recursive: true });

  // copy wrapper and bundle
  const srcWrapper = join(pluginDir, "bin", "claude-watch");
  const srcBundle = join(pluginDir, "dist", "cli.js");
  const destWrapper = join(stableBin, "claude-watch");
  const destBundle = join(stableDist, "cli.js");

  if (existsSync(srcWrapper)) {
    copyFileSync(srcWrapper, destWrapper);
    chmodSync(destWrapper, 0o755);
  }
  if (existsSync(srcBundle)) {
    copyFileSync(srcBundle, destBundle);
  }

  // install cron entry
  const cronLine = `*/5 * * * * '${destWrapper}' scan >> '${join(configDir, "claude-watch.log")}' 2>&1`;

  try {
    let existing = "";
    try {
      existing = execFileSync("crontab", ["-l"], { encoding: "utf-8" });
    } catch {
      // no existing crontab
    }

    const filtered = existing
      .split("\n")
      .filter((line) => !line.includes("claude-watch"))
      .join("\n");

    const newCrontab = (filtered.trim() + "\n" + cronLine + "\n").trim() + "\n";
    execSync(`echo '${newCrontab.replace(/'/g, "'\\''")}' | crontab -`);

    console.log("Installed claude-watch:");
    console.log(`  Stable binary: ${destWrapper}`);
    console.log(`  Cron: every 5 minutes`);
    console.log(`  Log: ${join(configDir, "claude-watch.log")}`);
    log("info", "install complete");
  } catch (err) {
    process.stderr.write(`Failed to install cron entry: ${err}\n`);
    process.exit(1);
  }
}
```

Create `src/commands/uninstall.ts`:

```ts
import { execFileSync, execSync } from "node:child_process";
import { getConfigDir } from "../core/config.js";
import { log } from "../core/log.js";

export function runUninstall(): void {
  try {
    let existing = "";
    try {
      existing = execFileSync("crontab", ["-l"], { encoding: "utf-8" });
    } catch {
      console.log("No crontab found — nothing to uninstall.");
      return;
    }

    if (!existing.includes("claude-watch")) {
      console.log("No claude-watch cron entry found.");
      return;
    }

    const filtered = existing
      .split("\n")
      .filter((line) => !line.includes("claude-watch"))
      .join("\n")
      .trim() + "\n";

    execSync(`echo '${filtered.replace(/'/g, "'\\''")}' | crontab -`);

    console.log("Removed claude-watch cron entry.");
    console.log(`Config and state preserved at ${getConfigDir()}`);
    log("info", "uninstall complete");
  } catch (err) {
    process.stderr.write(`Failed to uninstall: ${err}\n`);
    process.exit(1);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/install.ts src/commands/uninstall.ts
git commit -m "feat: add install/uninstall commands — cron setup + stable copy"
```

---

### Task 14: Bash wrapper + smoke test

**Files:**
- Modify: `bin/claude-watch`
- Create: `tests/wrapper-smoke.sh`

- [ ] **Step 1: Rewrite bash wrapper**

Overwrite `bin/claude-watch`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SENTINEL=$(mktemp -t claude-watch-attach.XXXXXX)
export CLAUDE_WATCH_SENTINEL="$SENTINEL"

SCRIPT_DIR="$(dirname "$(realpath "$0")")"
DIST="$SCRIPT_DIR/../dist/cli.js"

node "$DIST" "$@"
RC=$?

if [ -s "$SENTINEL" ]; then
    TARGET=$(cat "$SENTINEL")
    rm -f "$SENTINEL"
    exec tmux attach -t "$TARGET"
fi

rm -f "$SENTINEL"
exit $RC
```

```bash
chmod +x bin/claude-watch
```

- [ ] **Step 2: Create smoke test**

Create `tests/wrapper-smoke.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Fake dist/cli.js that writes sentinel
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

# Copy wrapper, fix DIST path
sed "s|SCRIPT_DIR=.*|SCRIPT_DIR=\"$BIN_DIR\"|" bin/claude-watch > "$BIN_DIR/claude-watch"
chmod +x "$BIN_DIR/claude-watch"

# Fake tmux that records args
TMUX_LOG="$TMPDIR/tmux.log"
cat > "$TMPDIR/tmux" <<TMUXEOF
#!/bin/bash
echo "\$@" > "$TMUX_LOG"
exit 0
TMUXEOF
chmod +x "$TMPDIR/tmux"

# Run wrapper without attach flag — should not call tmux
PATH="$TMPDIR:$PATH" "$BIN_DIR/claude-watch" version
if [ -f "$TMUX_LOG" ]; then
    echo "FAIL: tmux called when no attach expected"
    exit 1
fi

# Run wrapper with attach flag — should write sentinel and exec tmux
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
```

```bash
chmod +x tests/wrapper-smoke.sh
```

- [ ] **Step 3: Run smoke test**

```bash
bash tests/wrapper-smoke.sh
```

Expected: `PASS: wrapper smoke test`

- [ ] **Step 4: Commit**

```bash
git add bin/claude-watch tests/wrapper-smoke.sh
git commit -m "feat: rewrite bash wrapper with sentinel handoff, add smoke test"
```

---

### Task 15: Picker — theme + data hooks

**Files:**
- Create: `src/picker/theme.ts`, `src/picker/hooks/useSessions.ts`, `src/picker/hooks/useSearch.ts`

- [ ] **Step 1: Create theme**

Create `src/picker/theme.ts`:

```ts
export const theme = {
  bg: "#1a1a1a",
  fg: "#e8dfcf",
  dim: "#888888",
  accent: "#cc7b2e",
  border: "round" as const,
};
```

- [ ] **Step 2: Implement useSessions hook**

Create `src/picker/hooks/useSessions.ts`:

```ts
import { useState, useEffect, useCallback } from "react";
import { loadSessions, type Session } from "../../core/sessions.js";
import { loadState } from "../../core/state.js";
import { getTmuxDriver } from "../../core/tmux.js";
import { cwdToTmuxName } from "../../core/slug.js";
import { loadConfig } from "../../core/config.js";

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const config = loadConfig();

  const load = useCallback(async () => {
    setLoading(true);
    const all = await loadSessions();
    const state = loadState();
    const driver = getTmuxDriver();
    const watchedCwds = new Set(state.entries.map((e) => e.cwd));

    const enriched = all.map((s) => ({
      ...s,
      isWatched: s.cwd !== null && watchedCwds.has(s.cwd),
      isAlive: s.cwd !== null && driver.hasSession(cwdToTmuxName(s.cwd)),
    }));

    setSessions(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pageSize = config.pageSize;
  const paged = sessions.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(sessions.length / pageSize);

  return {
    sessions: paged,
    allSessions: sessions,
    loading,
    page,
    totalPages,
    pageSize,
    nextPage: () => setPage((p) => Math.min(p + 1, totalPages - 1)),
    prevPage: () => setPage((p) => Math.max(p - 1, 0)),
    reload: load,
    totalCount: sessions.length,
    watchedCount: sessions.filter((s) => s.isWatched).length,
  };
}
```

- [ ] **Step 3: Implement useSearch hook**

Create `src/picker/hooks/useSearch.ts`:

```ts
import { useState, useEffect, useRef } from "react";
import { execFile } from "node:child_process";
import { getProjectsDir } from "../../core/config.js";
import { join } from "node:path";

export function useSearch(query: string, allSessionIds: Set<string>) {
  const [matchingIds, setMatchingIds] = useState<Set<string> | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!query.trim()) {
      setMatchingIds(null);
      setSearching(false);
      return;
    }

    setSearching(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const projectsDir = getProjectsDir();
      const globPattern = join(projectsDir, "*", "*.jsonl");

      execFile(
        "rg",
        ["-l", "-i", "--fixed-strings", "--max-count=1", query, "--glob", "*.jsonl", projectsDir],
        { maxBuffer: 1024 * 1024 },
        (err, stdout) => {
          if (err && !stdout) {
            setMatchingIds(new Set());
            setSearching(false);
            return;
          }

          const paths = stdout.trim().split("\n").filter(Boolean);
          const ids = new Set<string>();
          for (const p of paths.slice(0, 100)) {
            const filename = p.split("/").pop()?.replace(".jsonl", "");
            if (filename && allSessionIds.has(filename)) {
              ids.add(filename);
            }
          }

          setMatchingIds(ids);
          setSearching(false);
        }
      );
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, allSessionIds]);

  return { matchingIds, searching };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/picker/theme.ts src/picker/hooks/useSessions.ts src/picker/hooks/useSearch.ts
git commit -m "feat: add picker theme and data hooks — useSessions, useSearch"
```

---

### Task 16: Picker — SessionList component

**Files:**
- Create: `src/picker/SessionList.tsx`
- Test: `tests/picker/SessionList.test.tsx`

- [ ] **Step 1: Implement SessionList**

Create `src/picker/SessionList.tsx`:

```tsx
import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "./theme.js";
import type { Session } from "../core/sessions.js";

interface Props {
  sessions: Session[];
  query: string;
  searching: boolean;
  selectedIndex: number;
  onSelect: (session: Session) => void;
  onIndexChange: (index: number) => void;
  onNewSession: () => void;
  page: number;
  totalPages: number;
  totalCount: number;
  watchedCount: number;
  onNextPage: () => void;
  onPrevPage: () => void;
}

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export function SessionList(props: Props): React.ReactElement {
  const {
    sessions, query, searching, selectedIndex,
    onSelect, onIndexChange, onNewSession,
    page, totalPages, totalCount, watchedCount,
    onNextPage, onPrevPage,
  } = props;

  useInput((input, key) => {
    if (key.upArrow) {
      onIndexChange(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      onIndexChange(Math.min(sessions.length - 1, selectedIndex + 1));
    } else if (key.pageDown) {
      onNextPage();
      onIndexChange(0);
    } else if (key.pageUp) {
      onPrevPage();
      onIndexChange(0);
    } else if (key.return) {
      if (sessions[selectedIndex]) onSelect(sessions[selectedIndex]);
    } else if (input === "n" && key.ctrl) {
      onNewSession();
    }
  });

  const statusLine = [
    `${totalCount} sessions`,
    `${watchedCount} watched`,
    query ? `filter: ${query}` : null,
    searching ? "searching…" : null,
  ].filter(Boolean).join(" · ");

  return (
    <Box flexDirection="column">
      <Box borderStyle={theme.border} paddingX={1}>
        <Text color={theme.fg}>claude-watch · pick a session</Text>
        <Text color={theme.dim}> — {statusLine}</Text>
      </Box>

      <Box paddingX={1}>
        <Text color={theme.dim}>search › </Text>
        <Text color={theme.fg}>{query || ""}</Text>
        <Text color={theme.dim}>_</Text>
      </Box>

      <Box flexDirection="column" paddingX={1} marginTop={1}>
        {sessions.length === 0 && query && (
          <Text color={theme.dim}>No sessions found with &quot;{query}&quot;</Text>
        )}

        {sessions.map((session, i) => {
          const isSelected = i === selectedIndex;
          const indicator = session.isWatched ? "●" : "○";
          const indicatorColor = session.isWatched ? theme.accent : theme.dim;
          const name = session.cwd
            ? session.cwd.split("/").pop() ?? session.slug
            : session.slug;

          return (
            <Box key={session.jsonlId} flexDirection="column" marginBottom={1}>
              <Box>
                {isSelected && <Text color={theme.accent}>❯ </Text>}
                {!isSelected && <Text>  </Text>}
                <Text color={indicatorColor}>{indicator} </Text>
                <Text color={isSelected ? theme.fg : theme.dim} bold={isSelected}>
                  {name}
                </Text>
                <Text color={theme.dim}>  {relativeTime(session.mtime)}</Text>
                {session.isWatched && <Text color={theme.dim}>  watched</Text>}
              </Box>
              <Box marginLeft={4}>
                <Text color={theme.dim}>{session.cwd ?? session.slug}</Text>
              </Box>
              <Box marginLeft={4}>
                <Text color={theme.dim}>&quot;{session.lastEvent}&quot;</Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box paddingX={1}>
        <Text color={theme.dim}>
          ↑↓ nav  pgdn more  ctrl-n new  ↵ select  esc quit
          {totalPages > 1 ? `  (page ${page + 1}/${totalPages})` : ""}
        </Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: Write SessionList test**

Create `tests/picker/SessionList.test.tsx`:

```tsx
import { describe, test, expect } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { SessionList } from "../../src/picker/SessionList";
import type { Session } from "../../src/core/sessions";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    jsonlPath: "/tmp/test.jsonl",
    jsonlId: "abc-123",
    slug: "-home-user-proj",
    cwd: "/home/user/proj",
    mtime: new Date(),
    lastEvent: "test message",
    isWatched: false,
    isAlive: false,
    ...overrides,
  };
}

const noop = () => {};

describe("SessionList", () => {
  test("renders session rows", () => {
    const sessions = [
      makeSession({ jsonlId: "a", cwd: "/home/user/alpha", lastEvent: "hello alpha" }),
      makeSession({ jsonlId: "b", cwd: "/home/user/beta", lastEvent: "hello beta", isWatched: true }),
    ];

    const { lastFrame } = render(
      <SessionList
        sessions={sessions}
        query=""
        searching={false}
        selectedIndex={0}
        onSelect={noop}
        onIndexChange={noop}
        onNewSession={noop}
        page={0}
        totalPages={1}
        totalCount={2}
        watchedCount={1}
        onNextPage={noop}
        onPrevPage={noop}
      />
    );

    const frame = lastFrame();
    expect(frame).toContain("alpha");
    expect(frame).toContain("beta");
    expect(frame).toContain("watched");
    expect(frame).toContain("hello alpha");
  });

  test("shows empty message when no matches", () => {
    const { lastFrame } = render(
      <SessionList
        sessions={[]}
        query="nonexistent"
        searching={false}
        selectedIndex={0}
        onSelect={noop}
        onIndexChange={noop}
        onNewSession={noop}
        page={0}
        totalPages={1}
        totalCount={0}
        watchedCount={0}
        onNextPage={noop}
        onPrevPage={noop}
      />
    );

    expect(lastFrame()).toContain('No sessions found with "nonexistent"');
  });
});
```

- [ ] **Step 3: Run tests**

```bash
bun test tests/picker/SessionList.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/picker/SessionList.tsx tests/picker/SessionList.test.tsx
git commit -m "feat: add SessionList picker component with tests"
```

---

### Task 17: Picker — PeekPanel + ActionMenu

**Files:**
- Create: `src/picker/PeekPanel.tsx`, `src/picker/ActionMenu.tsx`
- Test: `tests/picker/ActionMenu.test.tsx`

- [ ] **Step 1: Implement PeekPanel**

Create `src/picker/PeekPanel.tsx`:

```tsx
import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { extractPeek } from "../core/sessions.js";
import { loadConfig } from "../core/config.js";
import { theme } from "./theme.js";

interface Props {
  jsonlPath: string;
}

export function PeekPanel({ jsonlPath }: Props): React.ReactElement {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const config = loadConfig();

  useEffect(() => {
    setLoading(true);
    extractPeek(jsonlPath, config.peekLines).then((result) => {
      setLines(result);
      setLoading(false);
    });
  }, [jsonlPath, config.peekLines]);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={theme.dim}>peek (last {config.peekLines})</Text>
      <Text color={theme.dim}>{"─".repeat(60)}</Text>
      {loading ? (
        <Text color={theme.dim}>reading transcript…</Text>
      ) : (
        lines.map((line, i) => (
          <Text key={i} color={theme.dim} wrap="truncate">
            {line}
          </Text>
        ))
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Implement ActionMenu**

Create `src/picker/ActionMenu.tsx`:

```tsx
import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { theme } from "./theme.js";
import type { Session } from "../core/sessions.js";
import { activate, deactivate } from "../core/actions.js";
import { PeekPanel } from "./PeekPanel.js";
import { basename } from "node:path";

interface Props {
  session: Session;
  onBack: () => void;
}

export function ActionMenu({ session, onBack }: Props): React.ReactElement {
  const [status, setStatus] = useState<"idle" | "working" | "done">("idle");
  const [resultMsg, setResultMsg] = useState("");
  const { exit } = useApp();

  const name = session.cwd ? basename(session.cwd) : session.slug;
  const stateLabel = session.isWatched ? "ON" : "OFF";
  const primaryLabel = session.isWatched ? "deactivate" : "activate";
  const secondaryLabel = session.isWatched
    ? "deactivate + attach"
    : "activate + attach";

  async function doAction(attach: boolean): Promise<void> {
    if (!session.cwd) return;
    setStatus("working");

    try {
      if (session.isWatched) {
        await deactivate({ cwd: session.cwd, kill: !attach, attach });
      } else {
        await activate({ cwd: session.cwd, jsonlId: session.jsonlId, attach });
      }
      setResultMsg(`✓ ${primaryLabel}d`);
      setStatus("done");
      setTimeout(() => {
        if (attach) exit();
        else onBack();
      }, 500);
    } catch (err) {
      setResultMsg(`✗ ${err instanceof Error ? err.message : "unknown error"}`);
      setStatus("idle");
    }
  }

  useInput((input, key) => {
    if (status === "working") return;

    if (key.escape || (key.leftArrow && !key.meta)) {
      onBack();
    } else if (input === "q") {
      exit();
    } else if (key.return && key.ctrl) {
      doAction(true);
    } else if (key.return) {
      doAction(false);
    }
  });

  return (
    <Box flexDirection="column" borderStyle={theme.border} paddingX={1} paddingY={1}>
      <Box>
        <Text color={theme.fg} bold>{name}</Text>
        <Text color={theme.dim}> · </Text>
        <Text color={session.isWatched ? theme.accent : theme.dim}>{stateLabel}</Text>
        <Text color={theme.dim}> · {session.cwd ?? session.slug}</Text>
      </Box>

      <Box marginTop={1}>
        <PeekPanel jsonlPath={session.jsonlPath} />
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.dim}>─ actions ─</Text>

        {status === "working" && (
          <Text color={theme.accent}>⠋ working…</Text>
        )}

        {status === "done" && (
          <Text color={theme.accent}>{resultMsg}</Text>
        )}

        {status === "idle" && (
          <>
            <Box marginTop={1}>
              <Text color={theme.fg}>↵   {primaryLabel}</Text>
            </Box>
            <Box>
              <Text color={theme.fg}>^↵  {secondaryLabel}</Text>
            </Box>
            <Box marginTop={1}>
              <Text color={theme.dim}>esc back to list</Text>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
```

- [ ] **Step 3: Write ActionMenu test**

Create `tests/picker/ActionMenu.test.tsx`:

```tsx
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { ActionMenu } from "../../src/picker/ActionMenu";
import { setTmuxDriver, MockTmuxDriver } from "../../src/core/tmux";
import { makeFixture, makeUserEvent, type Fixture } from "../helpers/fixture";
import type { Session } from "../../src/core/sessions";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    jsonlPath: "/tmp/test.jsonl",
    jsonlId: "abc-123",
    slug: "-home-user-proj",
    cwd: "/home/user/proj",
    mtime: new Date(),
    lastEvent: "test message",
    isWatched: false,
    isAlive: false,
    ...overrides,
  };
}

describe("ActionMenu", () => {
  let f: Fixture;

  beforeEach(() => {
    f = makeFixture();
    f.setEnv();
    setTmuxDriver(new MockTmuxDriver());
  });

  afterEach(() => {
    f.restoreEnv();
    f.cleanup();
  });

  test("shows activate for unwatched session", () => {
    const session = makeSession({ isWatched: false });
    const { lastFrame } = render(
      <ActionMenu session={session} onBack={() => {}} />
    );
    expect(lastFrame()).toContain("activate");
    expect(lastFrame()).not.toContain("deactivate");
  });

  test("shows deactivate for watched session", () => {
    const session = makeSession({ isWatched: true });
    const { lastFrame } = render(
      <ActionMenu session={session} onBack={() => {}} />
    );
    expect(lastFrame()).toContain("deactivate");
  });
});
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/picker/ActionMenu.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/picker/PeekPanel.tsx src/picker/ActionMenu.tsx tests/picker/ActionMenu.test.tsx
git commit -m "feat: add PeekPanel and ActionMenu picker components"
```

---

### Task 18: Picker — NewSessionInput

**Files:**
- Create: `src/picker/NewSessionInput.tsx`
- Test: `tests/picker/NewSessionInput.test.tsx`

- [ ] **Step 1: Implement NewSessionInput**

Create `src/picker/NewSessionInput.tsx`:

```tsx
import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { theme } from "./theme.js";
import { createNew } from "../core/actions.js";

interface Props {
  onBack: () => void;
}

export function NewSessionInput({ onBack }: Props): React.ReactElement {
  const [path, setPath] = useState("~/");
  const [status, setStatus] = useState<"input" | "working" | "done">("input");
  const [resultMsg, setResultMsg] = useState("");
  const { exit } = useApp();

  function resolvePath(p: string): string {
    if (p.startsWith("~/")) {
      return p.replace("~", process.env.HOME ?? "/root");
    }
    return p.startsWith("/") ? p : `${process.cwd()}/${p}`;
  }

  async function doCreate(attach: boolean): Promise<void> {
    const resolved = resolvePath(path);
    setStatus("working");
    try {
      await createNew({ cwd: resolved, attach, remoteControl: true });
      setResultMsg(`✓ created ${resolved}`);
      setStatus("done");
      setTimeout(() => {
        if (attach) exit();
        else onBack();
      }, 500);
    } catch (err) {
      setResultMsg(`✗ ${err instanceof Error ? err.message : "unknown error"}`);
      setStatus("input");
    }
  }

  useInput((input, key) => {
    if (status !== "input") return;

    if (key.escape) {
      onBack();
    } else if (key.return && key.ctrl) {
      doCreate(true);
    } else if (key.return) {
      doCreate(false);
    } else if (key.backspace || key.delete) {
      setPath((p) => p.slice(0, -1));
    } else if (input && !key.ctrl && !key.meta) {
      setPath((p) => p + input);
    }
  });

  return (
    <Box flexDirection="column" borderStyle={theme.border} paddingX={1} paddingY={1}>
      <Text color={theme.fg} bold>new watched session</Text>

      <Box marginTop={1}>
        <Text color={theme.dim}>directory › </Text>
        <Text color={theme.fg}>{path}</Text>
        {status === "input" && <Text color={theme.dim}>_</Text>}
      </Box>

      <Box marginTop={1}>
        <Text color={theme.dim}>
          Directory will be created if it doesn't exist.
        </Text>
      </Box>

      {status === "working" && (
        <Box marginTop={1}>
          <Text color={theme.accent}>⠋ creating…</Text>
        </Box>
      )}

      {status === "done" && (
        <Box marginTop={1}>
          <Text color={theme.accent}>{resultMsg}</Text>
        </Box>
      )}

      {status === "input" && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.fg}>↵   create + activate</Text>
          <Text color={theme.fg}>^↵  create + activate + attach</Text>
          <Text color={theme.dim}>esc cancel</Text>
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Write test**

Create `tests/picker/NewSessionInput.test.tsx`:

```tsx
import { describe, test, expect } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { NewSessionInput } from "../../src/picker/NewSessionInput";

describe("NewSessionInput", () => {
  test("renders path input with default", () => {
    const { lastFrame } = render(<NewSessionInput onBack={() => {}} />);
    const frame = lastFrame();
    expect(frame).toContain("new watched session");
    expect(frame).toContain("directory");
    expect(frame).toContain("~/");
  });

  test("accepts typed input", () => {
    const { lastFrame, stdin } = render(<NewSessionInput onBack={() => {}} />);
    stdin.write("projects/test");
    const frame = lastFrame();
    expect(frame).toContain("~/projects/test");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
bun test tests/picker/NewSessionInput.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/picker/NewSessionInput.tsx tests/picker/NewSessionInput.test.tsx
git commit -m "feat: add NewSessionInput picker component — ctrl-n flow"
```

---

### Task 19: Picker — App + pick command

**Files:**
- Create: `src/picker/App.tsx`, `src/commands/pick.ts`
- Test: `tests/picker/App.test.tsx`

- [ ] **Step 1: Implement App**

Create `src/picker/App.tsx`:

```tsx
import React, { useState, useMemo } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { SessionList } from "./SessionList.js";
import { ActionMenu } from "./ActionMenu.js";
import { NewSessionInput } from "./NewSessionInput.js";
import { useSessions } from "./hooks/useSessions.js";
import { useSearch } from "./hooks/useSearch.js";
import type { Session } from "../core/sessions.js";

type Screen = "list" | "action" | "new";

export function App(): React.ReactElement {
  const [screen, setScreen] = useState<Screen>("list");
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const { exit } = useApp();

  const {
    sessions, allSessions, loading, page, totalPages,
    nextPage, prevPage, reload, totalCount, watchedCount,
  } = useSessions();

  const allIds = useMemo(
    () => new Set(allSessions.map((s) => s.jsonlId)),
    [allSessions]
  );

  const { matchingIds, searching } = useSearch(query, allIds);

  const filtered = matchingIds
    ? sessions.filter((s) => matchingIds.has(s.jsonlId))
    : sessions;

  useInput((input, key) => {
    if (screen !== "list") return;

    if (key.escape || (input === "c" && key.ctrl)) {
      exit();
    } else if (input === "d" && key.ctrl) {
      exit();
    } else if (input === "u" && key.ctrl) {
      setQuery("");
      setSelectedIndex(0);
    } else if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      setSelectedIndex(0);
    } else if (
      input &&
      !key.ctrl &&
      !key.meta &&
      !key.return &&
      !key.upArrow &&
      !key.downArrow &&
      !key.pageUp &&
      !key.pageDown
    ) {
      setQuery((q) => q + input);
      setSelectedIndex(0);
    }
  });

  function handleSelect(session: Session): void {
    setSelectedSession(session);
    setScreen("action");
  }

  function handleBack(): void {
    setScreen("list");
    setSelectedSession(null);
    reload();
  }

  if (loading) {
    return (
      <Box paddingX={1}>
        <Text>loading sessions…</Text>
      </Box>
    );
  }

  if (screen === "action" && selectedSession) {
    return <ActionMenu session={selectedSession} onBack={handleBack} />;
  }

  if (screen === "new") {
    return <NewSessionInput onBack={handleBack} />;
  }

  return (
    <SessionList
      sessions={filtered}
      query={query}
      searching={searching}
      selectedIndex={selectedIndex}
      onSelect={handleSelect}
      onIndexChange={setSelectedIndex}
      onNewSession={() => setScreen("new")}
      page={page}
      totalPages={totalPages}
      totalCount={matchingIds ? matchingIds.size : totalCount}
      watchedCount={watchedCount}
      onNextPage={nextPage}
      onPrevPage={prevPage}
    />
  );
}
```

- [ ] **Step 2: Implement pick command**

Create `src/commands/pick.ts`:

```ts
import React from "react";
import { render } from "ink";
import { App } from "../picker/App.js";

export async function runPick(): Promise<void> {
  if (!process.stdout.isTTY) {
    process.stderr.write(
      "claude-watch pick requires a TTY. Use status, activate, or deactivate instead.\n"
    );
    process.exit(2);
  }

  const { waitUntilExit } = render(React.createElement(App));
  await waitUntilExit();
}
```

- [ ] **Step 3: Write App integration test**

Create `tests/picker/App.test.tsx`:

```tsx
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { App } from "../../src/picker/App";
import { setTmuxDriver, MockTmuxDriver } from "../../src/core/tmux";
import { makeFixture, makeUserEvent, type Fixture } from "../helpers/fixture";

describe("App", () => {
  let f: Fixture;

  beforeEach(() => {
    f = makeFixture();
    f.setEnv();
    setTmuxDriver(new MockTmuxDriver());
  });

  afterEach(() => {
    f.restoreEnv();
    f.cleanup();
  });

  test("renders session list on launch", async () => {
    f.addSession("/home/user/proj", "abc-123", [makeUserEvent("hello world")]);

    const { lastFrame } = render(<App />);

    // wait for async load
    await Bun.sleep(50);

    const frame = lastFrame();
    expect(frame).toContain("pick a session");
  });
});
```

- [ ] **Step 4: Run tests**

```bash
bun test tests/picker/App.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Rebuild and test end-to-end**

```bash
bun run build
node dist/cli.js version
```

Expected: `claude-watch v0.2.0`

- [ ] **Step 6: Commit**

```bash
git add src/picker/App.tsx src/commands/pick.ts tests/picker/App.test.tsx
git commit -m "feat: add App picker root + pick command — full TUI wired"
```

---

### Task 20: Plugin infrastructure + CI + final build

**Files:**
- Modify: `.claude-plugin/plugin.json`, `hooks/hooks.json`, `README.md`
- Create: `skills/claude-watch/SKILL.md`, `.github/workflows/ci.yml`, `.husky/pre-commit`

- [ ] **Step 1: Update plugin.json**

Overwrite `.claude-plugin/plugin.json`:

```json
{
  "name": "claude-watch",
  "version": "0.2.0",
  "description": "Persistent, auto-resuscitating Claude Code sessions with interactive picker",
  "author": "openclaw",
  "homepage": "https://github.com/cryptomaltese/claude-watch",
  "keywords": ["session", "tmux", "watchdog", "persistent", "resume"]
}
```

- [ ] **Step 2: Update hooks.json**

Overwrite `hooks/hooks.json`:

```json
{
  "hooks": [
    {
      "event": "SessionStart",
      "command": "node dist/cli.js _hook session-start",
      "async": true
    }
  ]
}
```

- [ ] **Step 3: Create SKILL.md**

Create `skills/claude-watch/SKILL.md`:

```markdown
---
name: claude-watch
description: Manage persistent Claude Code sessions — interactive picker, activate/deactivate, view logs
---

# claude-watch — Session Manager

Use this skill when the user asks about managing Claude Code sessions, checking session status, starting/stopping watched sessions, or viewing watchdog logs.

## Quick Commands

Run these via Bash:

\`\`\`bash
claude-watch              # open interactive picker
claude-watch status       # show watched sessions
claude-watch scan         # run one watchdog cycle
claude-watch logs         # view recent logs
claude-watch install      # set up cron (first time only)
\`\`\`

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
\`\`\`
```

- [ ] **Step 4: Create CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install system dependencies
        run: sudo apt-get update && sudo apt-get install -y tmux ripgrep

      - name: Install npm dependencies
        run: bun install

      - name: Lint
        run: bun run lint

      - name: Test
        run: bun test

      - name: Build
        run: bun run build

      - name: Bundle freshness gate
        run: git diff --exit-code dist/cli.js

      - name: Wrapper smoke test
        run: bash tests/wrapper-smoke.sh
```

- [ ] **Step 5: Create husky pre-commit hook**

```bash
mkdir -p .husky
```

Create `.husky/pre-commit`:

```bash
#!/usr/bin/env bash
if git diff --cached --name-only | grep -qE '^src/'; then
  bun run build
  git add dist/cli.js
fi
```

```bash
chmod +x .husky/pre-commit
```

- [ ] **Step 6: Rewrite README.md**

Overwrite `README.md` with updated content reflecting the TS rewrite, Ink picker, new commands, and development setup. Include sections: What it does, Install, Quick start, Commands, Configuration, How it works, Requirements, Development, and License.

- [ ] **Step 7: Run full test suite + build**

```bash
bun test
bun run build
bash tests/wrapper-smoke.sh
```

Expected: all tests pass, build succeeds, smoke test passes.

- [ ] **Step 8: Commit and push**

```bash
git add -A
git commit -m "feat: add plugin infrastructure, CI, SKILL, README, husky pre-commit"
git push origin main
```

---

## Execution Order Summary

| Task | Description | Depends on |
|------|-------------|------------|
| 1 | Project scaffolding | — |
| 2 | Core — slug | 1 |
| 3 | Core — config, log, notices | 1 |
| 4 | Test fixture helper | 1, 2 |
| 5 | Core — sessions | 2, 3 |
| 6 | Core — tmux driver | 1 |
| 7 | Core — state | 3 |
| 8 | Core — actions | 2, 3, 5, 6, 7 |
| 9 | Core — SessionStart hook | 3 |
| 10 | CLI dispatcher | 3, 9 |
| 11 | Commands — version, help, logs, status | 7, 10 |
| 12 | Commands — activate, deactivate, new, scan | 5, 7, 8, 10 |
| 13 | Commands — install, uninstall | 3, 10 |
| 14 | Bash wrapper + smoke test | 1 |
| 15 | Picker — theme + data hooks | 2, 3, 5, 6, 7 |
| 16 | Picker — SessionList | 15 |
| 17 | Picker — PeekPanel + ActionMenu | 5, 8, 15 |
| 18 | Picker — NewSessionInput | 8, 15 |
| 19 | Picker — App + pick | 16, 17, 18 |
| 20 | Plugin infrastructure + CI | all |
