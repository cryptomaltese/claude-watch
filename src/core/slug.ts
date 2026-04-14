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

  // try candidate as absolute path first (handles case where slug encodes full path)
  if (existsSync(candidate)) return candidate;

  // try relative to fsRoot
  if (fsRoot !== "/") {
    const relative = join(fsRoot, candidate.slice(1));
    if (existsSync(relative)) return relative;
  }

  // try dot-prefix variants
  for (const prefix of KNOWN_DOT_PREFIXES) {
    const pattern = new RegExp(`/${prefix}`, "g");
    const dotted = candidate.replace(pattern, `/.${prefix}`);
    if (existsSync(dotted)) return dotted;
    if (fsRoot !== "/") {
      const relativeDotted = join(fsRoot, dotted.slice(1));
      if (existsSync(relativeDotted)) return relativeDotted;
    }
  }

  return null;
}

export function cwdToTmuxName(cwd: string): string {
  return `claude-${pathToSlug(cwd)}`;
}
