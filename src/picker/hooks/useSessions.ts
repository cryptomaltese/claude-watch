import { useState, useEffect, useCallback } from "react";
import { loadSessions, type Session } from "../../core/sessions.js";
import { loadState } from "../../core/state.js";
import { getTmuxDriver } from "../../core/tmux.js";
import { cwdToTmuxName } from "../../core/slug.js";
import { loadConfig } from "../../core/config.js";

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const config = loadConfig();

  const load = useCallback(async () => {
    setLoading(true);
    const all = await loadSessions();
    const state = loadState();
    const driver = getTmuxDriver();
    const watchedCwds = new Set(state.entries.map((e) => e.cwd));

    const enriched = all.map((s) => ({
      ...s,
      isWatched: s.cwd !== null && watchedCwds.has(s.cwd),
      isAlive: s.cwd !== null && driver.hasSession(cwdToTmuxName(s.cwd)),
    }));

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
