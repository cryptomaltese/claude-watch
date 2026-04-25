import { describe, test, expect } from "bun:test";
import { pathToSlug, slugToPath, cwdToTmuxName } from "../../src/core/slug";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("pathToSlug", () => {
  test("converts basic path", () => {
    expect(pathToSlug("/home/user/project")).toBe("-home-user-project");
  });

  test("handles dots (becomes dash)", () => {
    expect(pathToSlug("/home/user/.config/app")).toBe("-home-user--config-app");
  });

  test("handles consecutive dots", () => {
    expect(pathToSlug("/home/user/.openclaw/workspace")).toBe(
      "-home-user--openclaw-workspace"
    );
  });

  test("handles trailing slash", () => {
    expect(pathToSlug("/home/user/project/")).toBe("-home-user-project");
  });
});

describe("slugToPath", () => {
  let root: string;

  function setup(dirs: string[]): void {
    root = mkdtempSync(join(tmpdir(), "slug-test-"));
    for (const d of dirs) {
      mkdirSync(join(root, d), { recursive: true });
    }
  }

  function teardown(): void {
    rmSync(root, { recursive: true, force: true });
  }

  test("reverses a simple path", () => {
    setup(["home/user/project"]);
    const slug = "-home-user-project";
    expect(slugToPath(slug, root)).toBe(join(root, "home/user/project"));
    teardown();
  });

  test("resolves dot-prefix ambiguity via filesystem probe", () => {
    setup(["home/user/.openclaw/workspace"]);
    const slug = "-home-user--openclaw-workspace";
    expect(slugToPath(slug, root)).toBe(
      join(root, "home/user/.openclaw/workspace")
    );
    teardown();
  });

  test("returns null when path does not exist", () => {
    setup([]);
    expect(slugToPath("-totally-nonexistent-dir", root)).toBeNull();
    teardown();
  });
});

describe("cwdToTmuxName", () => {
  test("prefixes slug with claude-", () => {
    expect(cwdToTmuxName("/home/user/project")).toBe("claude--home-user-project");
  });
});
