import {
  readdirSync, readFileSync, statSync, existsSync,
  openSync, readSync, closeSync, fstatSync,
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

function readTail(filePath: string, bytes: number): string {
  const fd = openSync(filePath, "r");
  try {
    const stat = fstatSync(fd);
    const start = Math.max(0, stat.size - bytes);
    const buf = Buffer.alloc(Math.min(bytes, stat.size));
    readSync(fd, buf, 0, buf.length, start);
    return buf.toString("utf-8");
  } finally {
    closeSync(fd);
  }
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
    // read more than the very last line so we can skip noise events
    const content = readTail(jsonlPath, 16384);
    const lines = content.trim().split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const rendered = renderEvent(JSON.parse(lines[i]));
        if (rendered) return rendered.replace(/\s+/g, " ").slice(0, 100);
      } catch { continue; }
    }
    return "";
  } catch { return ""; }
}

export async function extractPeek(jsonlPath: string, count: number): Promise<string[]> {
  try {
    const content = readFileSync(jsonlPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const out: string[] = [];
    // Walk backwards, collecting renderable events until we have `count`
    for (let i = lines.length - 1; i >= 0 && out.length < count; i--) {
      try {
        const rendered = renderEvent(JSON.parse(lines[i]));
        if (rendered) out.unshift(rendered);
      } catch { continue; }
    }
    return out;
  } catch { return []; }
}

interface ContentBreakdown {
  text: string[];
  toolUses: string[];
  toolResults: string[];
  thinking: string[];
}

function breakdownContent(content: unknown): ContentBreakdown {
  const out: ContentBreakdown = { text: [], toolUses: [], toolResults: [], thinking: [] };
  if (typeof content === "string") {
    if (content.trim()) out.text.push(content);
    return out;
  }
  if (!Array.isArray(content)) return out;

  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    const type = String(b.type ?? "");

    if (type === "text" && typeof b.text === "string") {
      out.text.push(b.text);
    } else if (type === "tool_use") {
      out.toolUses.push(String(b.name ?? "tool"));
    } else if (type === "tool_result") {
      const nested = breakdownContent(b.content);
      if (nested.text.length) out.toolResults.push(nested.text.join(" "));
    } else if (type === "thinking" && typeof b.thinking === "string") {
      out.thinking.push(b.thinking);
    }
  }
  return out;
}

function truncate(s: string, max = 400): string {
  // Collapse ALL whitespace (including newlines) to single spaces so
  // each rendered event is one logical line. PeekPanel pairs this with
  // Text wrap="truncate" to cap at terminal width — gives a predictable
  // per-event row count, which the ActionMenu's height math depends on.
  const cleaned = s.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? cleaned.slice(0, max) + "…" : cleaned;
}

// Event types that are pure metadata/noise in the transcript peek view
const NOISE_TYPES = new Set(["summary", "file-history-snapshot"]);
const NOISE_SUBTYPES = new Set([
  "pr-link", "turn_duration", "last-prompt", "permission-mode",
  "compact_boundary",
]);

/**
 * Render a jsonl event for display, or return null if the event is
 * metadata/noise that should be skipped.
 */
function renderEvent(event: Record<string, unknown>): string | null {
  const type = String(event.type ?? "");
  if (NOISE_TYPES.has(type)) return null;

  if (type === "system" || type === "hook-result") {
    const subtype = String(event.subtype ?? "");
    if (NOISE_SUBTYPES.has(subtype)) return null;
    return subtype ? `[system: ${subtype}]` : null;
  }

  // User/assistant messages (wrapped in `message` object)
  if (event.message && typeof event.message === "object") {
    const msg = event.message as Record<string, unknown>;
    const role = String(msg.role ?? "unknown");
    const parts = breakdownContent(msg.content);

    // For user-role messages that are entirely tool results, render as tool output
    if (role === "user" && parts.text.length === 0 && parts.toolResults.length > 0) {
      return `tool: ${truncate(parts.toolResults.join(" "))}`;
    }

    // Assistant messages with only tool_use (no text)
    if (role === "assistant" && parts.text.length === 0 && parts.toolUses.length > 0) {
      return `assistant: [${parts.toolUses.join(", ")}]`;
    }

    if (parts.text.length > 0) {
      return `${role}: ${truncate(parts.text.join(" "))}`;
    }

    return null;
  }

  return null;
}

export function validateJsonl(jsonlPath: string): boolean {
  try {
    const content = readTail(jsonlPath, 4096);
    const lines = content.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return false;
    JSON.parse(lines[lines.length - 1]);
    return true;
  } catch { return false; }
}
