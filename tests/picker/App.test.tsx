import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { App } from "../../src/picker/App";
import { setTmuxDriver, MockTmuxDriver } from "../../src/core/tmux";
import { makeFixture, makeUserEvent, type Fixture } from "../helpers/fixture";

describe("App", () => {
  let f: Fixture;
  beforeEach(() => { f = makeFixture(); f.setEnv(); setTmuxDriver(new MockTmuxDriver()); });
  afterEach(() => { f.restoreEnv(); f.cleanup(); });

  test("renders session list on launch", async () => {
    f.addSession("/home/user/proj", "abc-123", [makeUserEvent("hello world")]);
    const { lastFrame } = render(<App />);
    await Bun.sleep(50);
    expect(lastFrame()).toContain("pick a session");
  });
});
