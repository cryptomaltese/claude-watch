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
