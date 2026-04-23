import { useState, useEffect, useRef } from "react";
import { execFile } from "node:child_process";
import { getProjectsDir } from "../../core/config.js";

export function useSearch(query: string, allSessionIds: Set<string>) {
  const [matchingIds, setMatchingIds] = useState<Set<string> | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!query.trim()) {
      setMatchingIds(null);
      setSearching(false);
      return;
    }

    setSearching(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const projectsDir = getProjectsDir();

      execFile(
        "rg",
        ["-l", "-i", "--fixed-strings", "--max-count=1", query, projectsDir],
        { maxBuffer: 1024 * 1024 },
        (err, stdout) => {
          if (err && !stdout) {
            setMatchingIds(new Set());
            setSearching(false);
            return;
          }

          const paths = stdout.trim().split("\n").filter(Boolean);
          const ids = new Set<string>();
          for (const p of paths.slice(0, 100)) {
            const filename = p.split("/").pop()?.replace(".jsonl", "");
            if (filename && allSessionIds.has(filename)) {
              ids.add(filename);
            }
          }

          setMatchingIds(ids);
          setSearching(false);
        }
      );
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, allSessionIds]);

  return { matchingIds, searching };
}
