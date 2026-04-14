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
