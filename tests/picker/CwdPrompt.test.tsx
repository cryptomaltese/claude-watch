import { describe, test, expect } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { CwdPrompt } from "../../src/picker/CwdPrompt";

describe("CwdPrompt", () => {
  test("renders title, default directory, and both action labels", () => {
    const { lastFrame } = render(
      <CwdPrompt
        title="fork session"
        primaryLabel="fork"
        secondaryLabel="fork + attach"
        onSubmit={async () => {}}
        onBack={() => {}}
      />
    );
    expect(lastFrame()).toContain("fork session");
    expect(lastFrame()).toContain("directory");
    expect(lastFrame()).toContain("fork");
    expect(lastFrame()).toContain("fork + attach");
  });

  test("primary action is selected by default (marked with ❯)", () => {
    const { lastFrame } = render(
      <CwdPrompt
        title="fork session"
        primaryLabel="create"
        secondaryLabel="create + attach"
        onSubmit={async () => {}}
        onBack={() => {}}
      />
    );
    expect(lastFrame()).toContain("❯ create");
    expect(lastFrame()).not.toContain("❯ create + attach");
  });

  test("accepts typed input", async () => {
    const { lastFrame, stdin } = render(
      <CwdPrompt
        title="fork session"
        primaryLabel="fork"
        secondaryLabel="fork + attach"
        onSubmit={async () => {}}
        onBack={() => {}}
      />
    );
    await Bun.sleep(20);
    stdin.write("projects/test");
    await Bun.sleep(20);
    expect(lastFrame()).toContain("projects/test");
  });

  test("shows hint when provided", () => {
    const { lastFrame } = render(
      <CwdPrompt
        title="fork session"
        primaryLabel="fork"
        secondaryLabel="fork + attach"
        hint="Fork into a new directory. Source stays untouched."
        onSubmit={async () => {}}
        onBack={() => {}}
      />
    );
    expect(lastFrame()).toContain("Source stays untouched");
  });
});
