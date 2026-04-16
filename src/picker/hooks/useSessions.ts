import { useState, useEffect, useCallback, useMemo } from "react";
import { loadSessions, type Session } from "../../core/sessions.js";
import { loadState } from "../../core/state.js";
import { getTmuxDriver } from "../../core/tmux.js";
import { cwdToTmuxNameCandidates } from "../../core/slug.js";
import { findTmuxForCwd } from "../../core/actions.js";
import { loadConfig } from "../../core/config.js";
import { basename } from "node:path";

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const config = useMemo(() => loadConfig(), []);

  const load = useCallback(async () => {
    setLoading(true);
    const all = await loadSessions();
    const state = loadState();
    const driver = getTmuxDriver();
    const watchedCwds = new Set(state.entries.map((e) => e.cwd));

    // Group by cwd and pick the newest jsonl per cwd. Only that jsonl
    // represents the active conversation — older ones in the same cwd are
    // archived forks/resumes, not currently running even if the tmux session
    // is alive.
    const newestPerCwd = new Map<string, string>();
    for (const s of all) {
      if (s.cwd === null) continue;
      const existing = newestPerCwd.get(s.cwd);
      if (!existing) {
        newestPerCwd.set(s.cwd, s.jsonlId);
      }
      // `all` is already sorted mtime desc, so the first one seen is newest
    }

    // Tmux sessions may have names we can't derive from cwd (e.g. user
    // started them manually with a custom name). Also collect the set of
    // cwds tmux reports via pane_current_path and match by that.
    const tmuxCwds = driver.listSessionCwds();

    const enriched = all.map((s) => {
      const isNewestInCwd = s.cwd !== null && newestPerCwd.get(s.cwd) === s.jsonlId;
      const tmuxAlive = s.cwd !== null && (
        cwdToTmuxNameCandidates(s.cwd).some((name) => driver.hasSession(name)) ||
        tmuxCwds.has(s.cwd)
      );
      return {
        ...s,
        isWatched: s.cwd !== null && watchedCwds.has(s.cwd),
        isAlive: isNewestInCwd && tmuxAlive,
      };
    });

    // Add synthetic entries for watched cwds that have no jsonl yet
    // (brand-new sessions created via ctrl-n before any conversation)
    const cwdsInList = new Set(all.map((s) => s.cwd).filter(Boolean));
    for (const entry of state.entries) {
      if (cwdsInList.has(entry.cwd)) continue;
      const tmuxName = findTmuxForCwd(driver, entry.cwd);
      enriched.unshift({
        jsonlPath: "",
        jsonlId: "",
        slug: "",
        cwd: entry.cwd,
        mtime: new Date(entry.pinnedAt),
        lastEvent: "(new session — no conversation yet)",
        isWatched: true,
        isAlive: tmuxName !== null,
      });
    }

    setSessions(enriched);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pageSize = config.pageSize;
  const paged = sessions.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.max(1, Math.ceil(sessions.length / pageSize));

  return {
    sessions: paged,
    allSessions: sessions,
    loading,
    page,
    totalPages,
    pageSize,
    nextPage: () => setPage((p) => Math.min(p + 1, totalPages - 1)),
    prevPage: () => setPage((p) => Math.max(p - 1, 0)),
    reload: load,
    totalCount: sessions.length,
    watchedCount: sessions.filter((s) => s.isWatched).length,
  };
}
