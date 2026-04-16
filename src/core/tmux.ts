import { execFileSync } from "node:child_process";

export interface TmuxDriver {
  hasSession(name: string): boolean;
  newSession(name: string, cwd: string, cmd: string): void;
  killSession(name: string): void;
  sendKeys(name: string, keys: string): void;
  capturePane(name: string): string;
  listSessions(): string[];
  /** Set of tmux session working directories (resolved via pane_current_path). */
  listSessionCwds(): Set<string>;
  /** Map of session name → pane_current_path. */
  getNameCwdMap(): Map<string, string>;
}

export class RealTmuxDriver implements TmuxDriver {
  hasSession(name: string): boolean {
    try {
      execFileSync("tmux", ["has-session", "-t", name], { stdio: "ignore" });
      return true;
    } catch { return false; }
  }
  newSession(name: string, cwd: string, cmd: string): void {
    execFileSync("tmux", ["new-session", "-d", "-s", name, "-c", cwd, cmd], { stdio: "ignore" });
  }
  killSession(name: string): void {
    try { execFileSync("tmux", ["kill-session", "-t", name], { stdio: "ignore" }); } catch {}
  }
  sendKeys(name: string, keys: string): void {
    execFileSync("tmux", ["send-keys", "-t", name, keys, "Enter"], { stdio: "ignore" });
  }
  capturePane(name: string): string {
    try { return execFileSync("tmux", ["capture-pane", "-t", name, "-p"], { encoding: "utf-8" }); }
    catch { return ""; }
  }
  listSessions(): string[] {
    try {
      const out = execFileSync("tmux", ["ls", "-F", "#{session_name}"], { encoding: "utf-8" });
      return out.trim().split("\n").filter(Boolean);
    } catch { return []; }
  }
  listSessionCwds(): Set<string> {
    return new Set(this.getNameCwdMap().values());
  }
  getNameCwdMap(): Map<string, string> {
    try {
      const out = execFileSync("tmux", ["ls", "-F", "#{session_name}\t#{pane_current_path}"], { encoding: "utf-8" });
      const map = new Map<string, string>();
      for (const line of out.trim().split("\n").filter(Boolean)) {
        const [name, path] = line.split("\t");
        if (name && path) map.set(name, path);
      }
      return map;
    } catch { return new Map(); }
  }
}

interface MockSession {
  cwd: string;
  cmd: string;
  keys: string[];
  paneContent: string;
}

export class MockTmuxDriver implements TmuxDriver {
  sessions = new Map<string, MockSession>();
  hasSession(name: string): boolean { return this.sessions.has(name); }
  newSession(name: string, cwd: string, cmd: string): void {
    this.sessions.set(name, { cwd, cmd, keys: [], paneContent: "" });
  }
  killSession(name: string): void { this.sessions.delete(name); }
  sendKeys(name: string, keys: string): void {
    const s = this.sessions.get(name);
    if (s) s.keys.push(keys);
  }
  capturePane(name: string): string { return this.sessions.get(name)?.paneContent ?? ""; }
  listSessions(): string[] { return Array.from(this.sessions.keys()); }
  listSessionCwds(): Set<string> {
    return new Set(Array.from(this.sessions.values()).map((s) => s.cwd));
  }
  getNameCwdMap(): Map<string, string> {
    const map = new Map<string, string>();
    for (const [name, s] of this.sessions) map.set(name, s.cwd);
    return map;
  }
}

let _driver: TmuxDriver | null = null;
export function setTmuxDriver(driver: TmuxDriver): void { _driver = driver; }
export function getTmuxDriver(): TmuxDriver {
  if (!_driver) _driver = new RealTmuxDriver();
  return _driver;
}
