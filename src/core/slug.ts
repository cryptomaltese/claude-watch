import { existsSync } from "node:fs";
import { join } from "node:path";

const KNOWN_DOT_PREFIXES = [
  "openclaw", "claude", "config", "local", "ssh", "npm", "nvm", "bun",
  "cargo", "rustup", "docker", "kube", "gnupg",
];

/**
 * Strip trailing slashes from a cwd. Callers that persist cwd (watched.json)
 * or match against other cwds (picker grouping) must use the normalized
 * form — otherwise "/foo/bar/" and "/foo/bar" become two distinct entries
 * that refer to the same directory.
 */
export function normalizeCwd(cwd: string): string {
  return cwd.replace(/\/+$/, "");
}

export function pathToSlug(cwd: string): string {
  return normalizeCwd(cwd).replace(/^\//, "-").replace(/[/.]/g, "-");
}

function normalize(p: string): string {
  // Collapse runs of consecutive slashes to a single slash.
  return p.replace(/\/+/g, "/");
}

export function slugToPath(
  slug: string,
  fsRoot: string = "/"
): string | null {
  const candidate = slug.replace(/^-/, "/").replace(/-/g, "/");

  if (existsSync(candidate)) return normalize(candidate);

  if (fsRoot !== "/") {
    const relative = join(fsRoot, candidate.slice(1));
    if (existsSync(relative)) return normalize(relative);
  }

  for (const prefix of KNOWN_DOT_PREFIXES) {
    const pattern = new RegExp(`/${prefix}`, "g");
    const dotted = candidate.replace(pattern, `/.${prefix}`);
    if (existsSync(dotted)) return normalize(dotted);
    if (fsRoot !== "/") {
      const relativeDotted = join(fsRoot, dotted.slice(1));
      if (existsSync(relativeDotted)) return normalize(relativeDotted);
    }
  }

  return null;
}

export function cwdToTmuxName(cwd: string): string {
  return `claude-${pathToSlug(cwd)}`;
}

/**
 * All tmux session names that could correspond to a given cwd.
 * Returns the canonical slug-based name first, then legacy basename format
 * (from the bash version of claude-watch).
 */
export function cwdToTmuxNameCandidates(cwd: string): string[] {
  const basename = cwd.replace(/\/+$/, "").split("/").pop() ?? "";
  const canonical = cwdToTmuxName(cwd);
  const legacy = `claude-${basename}`;
  return canonical === legacy ? [canonical] : [canonical, legacy];
}
