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
