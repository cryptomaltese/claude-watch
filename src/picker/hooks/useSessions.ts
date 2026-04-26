import { useState, useEffect, useCallback, useMemo } from "react";
import { loadEnrichedSessions, type EnrichedSession } from "../../core/sessions.js";
import { loadConfig } from "../../core/config.js";

export function useSessions() {
  const [sessions, setSessions] = useState<EnrichedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const config = useMemo(() => loadConfig(), []);

  const load = useCallback(async () => {
    setLoading(true);
    const enriched = await loadEnrichedSessions();
    // Picker UX: brand-new rows get the "no conversation yet" hint for
    // the lastEvent column. The CLI consumers just see lastEvent: "".
    const withPickerLabels = enriched.map((s) =>
      s.brandNew ? { ...s, lastEvent: "(new session — no conversation yet)" } : s
    );
    setSessions(withPickerLabels);
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
