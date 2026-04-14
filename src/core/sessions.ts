import {
  readdirSync, readFileSync, statSync, existsSync,
} from "node:fs";
import { join, basename } from "node:path";
import { getProjectsDir } from "./config.js";
import { slugToPath } from "./slug.js";

export interface Session {
  jsonlPath: string;
  jsonlId: string;
  slug: string;
  cwd: string | null;
  mtime: Date;
  lastEvent: string;
  isWatched: boolean;
  isAlive: boolean;
}

/**
 * Derive the filesystem root from the projects directory.
 * In production: projectsDir = /home/user/.claude/projects → fsRoot = "/"
 * In tests:      projectsDir = /tmp/cw-fixture-XXX/.claude/projects → fsRoot = /tmp/cw-fixture-XXX
 */
function fsRootFromProjectsDir(projectsDir: string): string {
  const suffix = "/.claude/projects";
  if (projectsDir.endsWith(suffix)) {
    const root = projectsDir.slice(0, -suffix.length);
    return root === "" ? "/" : root;
  }
  return "/";
}

export async function loadSessions(): Promise<Session[]> {
  const projectsDir = getProjectsDir();
  if (!existsSync(projectsDir)) return [];

  const fsRoot = fsRootFromProjectsDir(projectsDir);
  const sessions: Session[] = [];

  for (const slugDir of readdirSync(projectsDir)) {
    const slugPath = join(projectsDir, slugDir);
    const stat = statSync(slugPath, { throwIfNoEntry: false });
    if (!stat?.isDirectory()) continue;

    let jsonls: string[];
    try {
      jsonls = readdirSync(slugPath).filter((f) => f.endsWith(".jsonl"));
    } catch { continue; }

    for (const jsonlFile of jsonls) {
      const jsonlPath = join(slugPath, jsonlFile);
      const jsonlStat = statSync(jsonlPath, { throwIfNoEntry: false });
      if (!jsonlStat) continue;

      const jsonlId = basename(jsonlFile, ".jsonl");
      const cwd = slugToPath(slugDir, fsRoot);

      sessions.push({
        jsonlPath,
        jsonlId,
        slug: slugDir,
        cwd,
        mtime: jsonlStat.mtime,
        lastEvent: extractLastEvent(jsonlPath),
        isWatched: false,
        isAlive: false,
      });
    }
  }

  sessions.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return sessions;
}

function extractLastEvent(jsonlPath: string): string {
  try {
    const content = readFileSync(jsonlPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return "";
    const last = JSON.parse(lines[lines.length - 1]);
    return renderEvent(last).slice(0, 100);
  } catch { return ""; }
}

export async function extractPeek(jsonlPath: string, count: number): Promise<string[]> {
  try {
    const content = readFileSync(jsonlPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const tail = lines.slice(-count);
    return tail.map((line) => {
      try { return renderEvent(JSON.parse(line)); }
      catch { return line.slice(0, 100); }
    });
  } catch { return []; }
}

function renderEvent(event: Record<string, unknown>): string {
  if (event.message && typeof event.message === "object") {
    const msg = event.message as Record<string, unknown>;
    const role = String(msg.role ?? "unknown");
    const content = typeof msg.content === "string"
      ? msg.content
      : JSON.stringify(msg.content);
    return `${role}: ${content.replace(/\n/g, " ")}`;
  }
  if (event.name && event.content) {
    return `tool(${event.name}): ${String(event.content).replace(/\n/g, " ")}`;
  }
  return JSON.stringify(event).slice(0, 100);
}

export function validateJsonl(jsonlPath: string): boolean {
  try {
    const content = readFileSync(jsonlPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return false;
    JSON.parse(lines[lines.length - 1]);
    return true;
  } catch { return false; }
}
