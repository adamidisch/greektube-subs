import type { RunSource, RunState, UsageMetric } from "./batched.ts";
import type { Sql } from "../published-store.ts";

/**
 * Neon storage of automatic runs. Every call here that changes data is one "permanent write" of the run and is
 * counted in state.usage.writes; the monthly usage counters are updated inside the same SQL statement.
 */
const period = (date = new Date()) => date.toISOString().slice(0, 7);

export function createRunStore(sql: Sql) {
  let ensured: Promise<void> | null = null;
  function ensure() {
    ensured ??= (async () => {
      await sql(`CREATE TABLE IF NOT EXISTS auto_subtitle_runs (
        run_id TEXT PRIMARY KEY, video_id TEXT NOT NULL, kind TEXT NOT NULL, capture_hash TEXT NOT NULL,
        state TEXT NOT NULL, source TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await sql("CREATE INDEX IF NOT EXISTS auto_subtitle_runs_video_idx ON auto_subtitle_runs (video_id, kind, created_at DESC)");
      await sql(`CREATE TABLE IF NOT EXISTS usage_budget (period TEXT NOT NULL, metric TEXT NOT NULL, used BIGINT NOT NULL DEFAULT 0,
        PRIMARY KEY (period, metric))`);
    })().catch(error => { ensured = null; throw error; });
    return ensured;
  }

  const usageValues = (delta: Partial<Record<UsageMetric, number>>, offset: number) => {
    const entries = Object.entries(delta).filter(([, value]) => value && value > 0) as [UsageMetric, number][];
    return { entries, sql: entries.map((_, i) => `($${offset + i * 3 + 1}, $${offset + i * 3 + 2}, $${offset + i * 3 + 3})`).join(", "),
      params: entries.flatMap(([metric, value]) => [period(), metric, Math.round(value)]) };
  };

  return {
    async monthUsage() {
      await ensure();
      const rows = await sql("SELECT metric, used FROM usage_budget WHERE period = $1", [period()]);
      return Object.fromEntries(rows.map(row => [String(row.metric), Number(row.used)])) as Partial<Record<UsageMetric, number>>;
    },
    async latest(videoId: string, kind?: RunState["kind"]) {
      await ensure();
      const rows = await sql(`SELECT state, version FROM auto_subtitle_runs WHERE video_id = $1 ${kind ? "AND kind = $2" : ""} ORDER BY created_at DESC LIMIT 1`, kind ? [videoId, kind] : [videoId]);
      return rows[0] ? { state: JSON.parse(String(rows[0].state)) as RunState, version: Number(rows[0].version) } : null;
    },
    async load(runId: string) {
      await ensure();
      const rows = await sql("SELECT state, source, version FROM auto_subtitle_runs WHERE run_id = $1", [runId]);
      if (!rows[0]) return null;
      const state = JSON.parse(String(rows[0].state)) as RunState, source = String(rows[0].source);
      return { state, source: JSON.parse(source) as RunSource, version: Number(rows[0].version), bytes: source.length + String(rows[0].state).length };
    },
    /** Write 1 of the run: state and source together. */
    async create(state: RunState, source: RunSource) {
      await ensure();
      state.usage.writes += 1;
      const stateText = JSON.stringify(state), sourceText = JSON.stringify(source);
      const usage = usageValues({ neon_bytes: stateText.length + sourceText.length }, 6);
      await sql(`WITH u AS (INSERT INTO usage_budget (period, metric, used) VALUES ${usage.sql}
          ON CONFLICT (period, metric) DO UPDATE SET used = usage_budget.used + EXCLUDED.used)
        INSERT INTO auto_subtitle_runs (run_id, video_id, kind, capture_hash, state, source) VALUES ($1, $2, $3, $4, $5, $6)`,
        [state.runId, state.videoId, state.kind, state.captureHash, stateText, sourceText, ...usage.params]);
      return 1;
    },
    /** One permanent write: the run state (optimistic version) plus this step's usage counters. */
    async save(state: RunState, version: number, delta: Partial<Record<UsageMetric, number>>) {
      await ensure();
      state.usage.writes += 1;
      state.updatedAt = new Date().toISOString();
      const stateText = JSON.stringify(state);
      const usage = usageValues({ ...delta, neon_bytes: (delta.neon_bytes ?? 0) + stateText.length }, 3);
      const rows = await sql(`WITH u AS (INSERT INTO usage_budget (period, metric, used) VALUES ${usage.sql}
          ON CONFLICT (period, metric) DO UPDATE SET used = usage_budget.used + EXCLUDED.used)
        UPDATE auto_subtitle_runs SET state = $1, version = version + 1, updated_at = now() WHERE run_id = $2 AND version = $3 RETURNING version`,
        [stateText, state.runId, version, ...usage.params]);
      if (!rows[0]) { state.usage.writes -= 1; throw Error("Η κατάσταση της ροής άλλαξε από άλλο βήμα."); }
      return Number(rows[0].version);
    },
  };
}
