/**
 * evalsnap types.
 *
 * evalsnap compares two snapshots of agent or tool outputs —
 * a baseline run and a current run. Each snapshot is a list of
 * cases identified by case_id, carrying the produced output
 * and, where the caller measured them, a score and a duration.
 * The diff reports, as pure local computation:
 *
 *   - which cases are matched, added, or removed
 *   - for every matched case, whether its output changed, the
 *     score and duration deltas, and whether it regressed
 *   - the regression list and the count of improved cases
 *   - each side's average score over the matched cases that
 *     carry a score on both sides
 *   - a pass/fail verdict driven only by regressions
 *
 * Nothing is fetched or executed: every number comes only
 * from the two snapshots supplied.
 */

/** One case inside one snapshot, as supplied by the caller. */
export interface SnapshotEntry {
  /** Case identifier; unique within its snapshot side. */
  case_id: string;
  /** Output produced for this case. */
  output: string;
  /** Score for this case, when measured. */
  score?: number;
  /** Duration in milliseconds, when measured; must be >= 0. */
  duration_ms?: number;
}

/** Per-case comparison for a case present on both sides. */
export interface CaseResult {
  case_id: string;
  /** "unchanged" when outputs are exactly equal, else "changed". */
  status: "unchanged" | "changed";
  /** current.score - baseline.score, rounded to 4 dp; null when either side lacks a score. */
  score_delta: number | null;
  /** current.duration_ms - baseline.duration_ms, rounded to 4 dp; null when either side lacks it. */
  duration_delta_ms: number | null;
  /** True exactly when score_delta is not null and < 0. */
  regression: boolean;
}

/** The snapshot diff. */
export interface EvalSnapResult {
  total_baseline: number;
  total_current: number;
  /** Number of case_ids present on both sides. */
  matched: number;
  /** Matched cases whose outputs are exactly equal. */
  unchanged: number;
  /** Matched cases whose outputs differ. */
  changed: number;
  /** case_ids only in current, sorted ascending. */
  added: string[];
  /** case_ids only in baseline, sorted ascending. */
  removed: string[];
  /** One entry per matched case, sorted by case_id ascending. */
  case_results: CaseResult[];
  /** case_ids of matched cases with regression true, sorted ascending. */
  regressions: string[];
  /** Matched cases with score_delta > 0. */
  improved_count: number;
  /** Average baseline score over matched cases scored on both sides; null when there are none. */
  baseline_avg_score: number | null;
  /** Average current score over that same case set; null when there are none. */
  current_avg_score: number | null;
  /** "fail" when regressions is non-empty, else "pass". */
  verdict: "pass" | "fail";
}
