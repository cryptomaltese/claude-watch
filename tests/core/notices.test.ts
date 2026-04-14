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
