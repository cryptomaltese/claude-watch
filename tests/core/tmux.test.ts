import { describe, test, expect } from "bun:test";
import { MockTmuxDriver } from "../../src/core/tmux";

describe("MockTmuxDriver", () => {
  test("tracks session lifecycle", () => {
    const driver = new MockTmuxDriver();
    expect(driver.hasSession("test")).toBe(false);
    driver.newSession("test", "/tmp", "echo hi");
    expect(driver.hasSession("test")).toBe(true);
    expect(driver.sessions.get("test")).toEqual({ cwd: "/tmp", cmd: "echo hi", keys: [], paneContent: "" });
    driver.killSession("test");
    expect(driver.hasSession("test")).toBe(false);
  });

  test("sendKeys records sent keys", () => {
    const driver = new MockTmuxDriver();
    driver.newSession("test", "/tmp", "echo hi");
    driver.sendKeys("test", "/remote-control");
    driver.sendKeys("test", "Enter");
    expect(driver.sessions.get("test")!.keys).toEqual(["/remote-control", "Enter"]);
  });
});
