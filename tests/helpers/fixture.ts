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
