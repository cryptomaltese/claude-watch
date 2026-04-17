import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { sessionStartHook } from "../../../src/core/hooks/sessionStart";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("sessionStartHook", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "hook-test-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  test("returns ok when defaultMode is auto and enableAutoMode is true", () => {
    const settingsDir = join(dir, ".claude");
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      join(settingsDir, "settings.json"),
      JSON.stringify({ permissions: { defaultMode: "auto" }, enableAutoMode: true })
    );
    const result = sessionStartHook({ claudeHome: settingsDir, cwd: dir });
    expect(result.result).toBe("ok");
  });

  test("returns ok when defaultMode is bypassPermissions", () => {
    const settingsDir = join(dir, ".claude");
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      join(settingsDir, "settings.json"),
      JSON.stringify({ permissions: { defaultMode: "bypassPermissions" } })
    );
    const result = sessionStartHook({ claudeHome: settingsDir, cwd: dir });
    expect(result.result).toBe("ok");
  });

  test("warns when defaultMode is auto but enableAutoMode is not true", () => {
    const settingsDir = join(dir, ".claude");
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      join(settingsDir, "settings.json"),
      JSON.stringify({ permissions: { defaultMode: "auto" } })
    );
    const result = sessionStartHook({ claudeHome: settingsDir, cwd: dir });
    expect(result.result).toBe("warn");
    expect(result.message).toContain("enableAutoMode");
  });

  test("warns when defaultMode is neither auto nor bypassPermissions", () => {
    const settingsDir = join(dir, ".claude");
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      join(settingsDir, "settings.json"),
      JSON.stringify({ permissions: {} })
    );
    const result = sessionStartHook({ claudeHome: settingsDir, cwd: dir });
    expect(result.result).toBe("warn");
    expect(result.message).toMatch(/auto|bypassPermissions/);
  });

  test("ignores local settings.local.json allow list (not a real bypass override)", () => {
    const settingsDir = join(dir, ".claude");
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      join(settingsDir, "settings.json"),
      JSON.stringify({ permissions: { defaultMode: "bypassPermissions" } })
    );
    writeFileSync(
      join(settingsDir, "settings.local.json"),
      JSON.stringify({ permissions: { allow: ["Bash(*)"] } })
    );
    const result = sessionStartHook({ claudeHome: settingsDir, cwd: dir });
    expect(result.result).toBe("ok");
  });
});
