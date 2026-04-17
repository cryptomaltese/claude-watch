import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig, getConfigDir, getProjectsDir } from "../../src/core/config";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
    expect(cfg.permissionMode).toBe("auto");
    expect(cfg.dangerouslySkipPermissions).toBe(false);
  });

  test("accepts valid permissionMode", () => {
    writeFileSync(
      join(dir, "config.json"),
      JSON.stringify({ permissionMode: "bypassPermissions", dangerouslySkipPermissions: true })
    );
    const cfg = loadConfig();
    expect(cfg.permissionMode).toBe("bypassPermissions");
    expect(cfg.dangerouslySkipPermissions).toBe(true);
  });

  test("falls back to default for invalid permissionMode", () => {
    writeFileSync(join(dir, "config.json"), JSON.stringify({ permissionMode: "lolcat" }));
    const cfg = loadConfig();
    expect(cfg.permissionMode).toBe("auto");
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
