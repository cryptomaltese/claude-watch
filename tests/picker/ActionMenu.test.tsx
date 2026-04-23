import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { ActionMenu } from "../../src/picker/ActionMenu";
import { setTmuxDriver, MockTmuxDriver } from "../../src/core/tmux";
import { makeFixture, type Fixture } from "../helpers/fixture";
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
  beforeEach(() => { f = makeFixture(); f.setEnv(); setTmuxDriver(new MockTmuxDriver()); });
  afterEach(() => { f.restoreEnv(); f.cleanup(); });

  test("shows activate for unwatched session", () => {
    const { lastFrame } = render(<ActionMenu session={makeSession({ isWatched: false })} onBack={() => {}} onFork={() => {}} />);
    expect(lastFrame()).toContain("activate");
    expect(lastFrame()).not.toContain("deactivate");
  });

  test("shows deactivate for watched session", () => {
    const { lastFrame } = render(<ActionMenu session={makeSession({ isWatched: true })} onBack={() => {}} onFork={() => {}} />);
    expect(lastFrame()).toContain("deactivate");
  });

  test("shows fork + fork + attach when session has jsonlId", () => {
    const { lastFrame } = render(
      <ActionMenu session={makeSession({ jsonlId: "abc-123" })} onBack={() => {}} onFork={() => {}} />
    );
    expect(lastFrame()).toContain("fork");
    expect(lastFrame()).toContain("fork + attach");
  });

  test("hides fork actions when jsonlId is empty", () => {
    const { lastFrame } = render(
      <ActionMenu session={makeSession({ jsonlId: "" })} onBack={() => {}} onFork={() => {}} />
    );
    expect(lastFrame()).not.toContain("fork");
  });
});
