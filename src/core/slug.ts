import { existsSync } from "node:fs";
import { join } from "node:path";

const KNOWN_DOT_PREFIXES = [
  "openclaw", "claude", "config", "local", "ssh", "npm", "nvm", "bun",
  "cargo", "rustup", "docker", "kube", "gnupg",
];

export function pathToSlug(cwd: string): string {
  const normalized = cwd.replace(/\/+$/, "");
  return normalized.replace(/^\//, "-").replace(/[/.]/g, "-");
}

export function slugToPath(
  slug: string,
  fsRoot: string = "/"
): string | null {
  const candidate = slug.replace(/^-/, "/").replace(/-/g, "/");
  const full = fsRoot === "/" ? candidate : join(fsRoot, candidate.slice(1));

  if (existsSync(full)) return full;

  for (const prefix of KNOWN_DOT_PREFIXES) {
    const pattern = new RegExp(`/${prefix}`, "g");
    const dotted = candidate.replace(pattern, `/.${prefix}`);
    const fullDotted =
      fsRoot === "/" ? dotted : join(fsRoot, dotted.slice(1));
    if (existsSync(fullDotted)) return fullDotted;
  }

  return null;
}

export function cwdToTmuxName(cwd: string): string {
  return `claude-${pathToSlug(cwd)}`;
}
