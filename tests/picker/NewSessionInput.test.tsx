import { describe, test, expect } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { NewSessionInput } from "../../src/picker/NewSessionInput";

describe("NewSessionInput", () => {
  test("renders path input with default", () => {
    const { lastFrame } = render(<NewSessionInput onBack={() => {}} />);
    expect(lastFrame()).toContain("new watched session");
    expect(lastFrame()).toContain("directory");
  });

  test("accepts typed input", async () => {
    const { lastFrame, stdin } = render(<NewSessionInput onBack={() => {}} />);
    await Bun.sleep(20);
    stdin.write("projects/test");
    await Bun.sleep(20);
    expect(lastFrame()).toContain("projects/test");
  });
});
