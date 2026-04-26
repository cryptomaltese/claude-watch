import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { ForkSessionInput } from "../../src/picker/ForkSessionInput";
import { setTmuxDriver, MockTmuxDriver } from "../../src/core/tmux";
import { makeFixture, type Fixture } from "../helpers/fixture";
import type { Session } from "../../src/core/sessions";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    jsonlPath: "/tmp/test.jsonl",
    jsonlId: "abc12345-1234-1234-1234-abc123456789",
    slug: "-home-user-proj",
    cwd: "/home/user/proj",
    mtime: new Date(),
    lastEvent: "",
    isWatched: false,
    isAlive: false,
    ...overrides,
  };
}

describe("ForkSessionInput", () => {
  let f: Fixture;
  beforeEach(() => { f = makeFixture(); f.setEnv(); setTmuxDriver(new MockTmuxDriver()); });
  afterEach(() => { f.restoreEnv(); f.cleanup(); });

  test("renders fork title with source cwd and both action labels", () => {
    const { lastFrame } = render(
      <ForkSessionInput session={makeSession()} onBack={() => {}} />
    );
    expect(lastFrame()).toContain("fork session");
    expect(lastFrame()).toContain("/home/user/proj");
    expect(lastFrame()).toContain("fork");
    expect(lastFrame()).toContain("fork + attach");
    expect(lastFrame()).toContain("Source session stays untouched");
  });
});
