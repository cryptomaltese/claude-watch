import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { sessionStartHook } from "../../../src/core/hooks/sessionStart";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("sessionStartHook", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "hook-test-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  test("returns ok when bypassPermissions is set", () => {
    const settingsDir = join(dir, ".claude");
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(join(settingsDir, "settings.json"), JSON.stringify({ permissions: { defaultMode: "bypassPermissions" } }));
    const result = sessionStartHook({ claudeHome: settingsDir, cwd: dir });
    expect(result.result).toBe("ok");
  });

  test("warns when bypassPermissions is not set", () => {
    const settingsDir = join(dir, ".claude");
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(join(settingsDir, "settings.json"), JSON.stringify({ permissions: {} }));
    const result = sessionStartHook({ claudeHome: settingsDir, cwd: dir });
    expect(result.result).toBe("warn");
    expect(result.message).toContain("bypassPermissions");
  });

  test("warns when local settings has allow list", () => {
    const settingsDir = join(dir, ".claude");
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(join(settingsDir, "settings.json"), JSON.stringify({ permissions: { defaultMode: "bypassPermissions" } }));
    const localDir = join(dir, ".claude");
    writeFileSync(join(localDir, "settings.local.json"), JSON.stringify({ permissions: { allow: ["Bash(*)"] } }));
    const result = sessionStartHook({ claudeHome: settingsDir, cwd: dir });
    expect(result.result).toBe("warn");
    expect(result.message).toContain("allow");
  });
});
