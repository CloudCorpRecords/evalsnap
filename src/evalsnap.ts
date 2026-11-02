/**
 * evalsnap core: snapshot diffing for agent and tool outputs.
 *
 *   diffSnapshots(baseline, current) -> diff
 *
 * Behaviour:
 * - Entries are matched by case_id. A case_id on both sides is
 *   matched; only in current it is added; only in baseline it
 *   is removed.
 * - A matched case is "unchanged" when its outputs are exactly
 *   equal, otherwise "changed". score_delta is
 *   current.score - baseline.score rounded to 4 decimal places
 *   when both sides carry a score, otherwise null.
 *   duration_delta_ms follows the same rule for duration_ms.
 *   regression is true exactly when score_delta is not null
 *   and negative.
 * - case_results are sorted by case_id ascending; added,
 *   removed, and regressions are sorted ascending too.
 * - improved_count counts matched cases with score_delta > 0.
 * - baseline_avg_score and current_avg_score average each
 *   side over the matched cases that carry a score on both
 *   sides, rounded to 4 decimal places; both are null when
 *   no matched case has both scores.
 * - verdict is "fail" when regressions is non-empty, else
 *   "pass". Added and removed cases never fail the verdict
 *   on their own.
 *
 * Validation is strict and path-naming: any malformed input
 * throws an Error naming the offending path and side (for
 * example "baseline[2].case_id duplicates baseline[0]") and
 * no partial result is produced.
 */
import type { CaseResult, EvalSnapResult, SnapshotEntry } from "./types.js";

export const VERSION = "0.1.0";

function round4(value: number): number {
  const rounded = Math.round(value * 10000) / 10000;
  return rounded === 0 ? 0 : rounded;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateEntry(
  raw: unknown,
  side: "baseline" | "current",
  index: number,
  seen: Map<string, number>,
): SnapshotEntry {
  const path = `${side}[${index}]`;
  if (!isRecord(raw)) throw new Error(`${path} must be an object`);
  if (raw.case_id === undefined) throw new Error(`${path}.case_id is required`);
  if (typeof raw.case_id !== "string" || raw.case_id.length === 0) {
    throw new Error(`${path}.case_id must be a non-empty string`);
  }
  const firstIndex = seen.get(raw.case_id);
  if (firstIndex !== undefined) {
    throw new Error(
      `${path}.case_id duplicates ${side}[${firstIndex}]`,
    );
  }
  seen.set(raw.case_id, index);
  if (raw.output === undefined) throw new Error(`${path}.output is required`);
  if (typeof raw.output !== "string") {
    throw new Error(`${path}.output must be a string`);
  }
  if (raw.score !== undefined) {
    if (typeof raw.score !== "number" || !Number.isFinite(raw.score)) {
      throw new Error(`${path}.score must be a number`);
    }
  }
  if (raw.duration_ms !== undefined) {
    if (typeof raw.duration_ms !== "number" || !Number.isFinite(raw.duration_ms)) {
      throw new Error(`${path}.duration_ms must be a number`);
    }
    if (raw.duration_ms < 0) {
      throw new Error(`${path}.duration_ms must be >= 0`);
    }
  }
  const entry: SnapshotEntry = { case_id: raw.case_id, output: raw.output };
  if (raw.score !== undefined) entry.score = raw.score;
  if (raw.duration_ms !== undefined) entry.duration_ms = raw.duration_ms;
  return entry;
}

function validateSide(
  raw: unknown,
  side: "baseline" | "current",
): SnapshotEntry[] {
  if (raw === undefined) throw new Error(`${side} is required`);
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`${side} must be a non-empty array`);
  }
  const seen = new Map<string, number>();
  return raw.map((entry, i) => validateEntry(entry, side, i, seen));
}

/** Diff a current snapshot against a baseline snapshot. */
export function diffSnapshots(
  baseline: unknown,
  current: unknown,
): EvalSnapResult {
  const validBaseline = validateSide(baseline, "baseline");
  const validCurrent = validateSide(current, "current");

  const baselineById = new Map(validBaseline.map((e) => [e.case_id, e]));
  const currentById = new Map(validCurrent.map((e) => [e.case_id, e]));

  const matchedIds = validBaseline
    .map((e) => e.case_id)
    .filter((id) => currentById.has(id))
    .sort();
  const added = validCurrent
    .map((e) => e.case_id)
    .filter((id) => !baselineById.has(id))
    .sort();
  const removed = validBaseline
    .map((e) => e.case_id)
    .filter((id) => !currentById.has(id))
    .sort();

  const caseResults: CaseResult[] = matchedIds.map((caseId) => {
    const base = baselineById.get(caseId) as SnapshotEntry;
    const curr = currentById.get(caseId) as SnapshotEntry;
    const scoreDelta =
      base.score !== undefined && curr.score !== undefined
        ? round4(curr.score - base.score)
        : null;
    const durationDelta =
      base.duration_ms !== undefined && curr.duration_ms !== undefined
        ? round4(curr.duration_ms - base.duration_ms)
        : null;
    return {
      case_id: caseId,
      status: base.output === curr.output ? "unchanged" : "changed",
      score_delta: scoreDelta,
      duration_delta_ms: durationDelta,
      regression: scoreDelta !== null && scoreDelta < 0,
    };
  });

  const regressions = caseResults
    .filter((r) => r.regression)
    .map((r) => r.case_id)
    .sort();
  const improvedCount = caseResults.filter(
    (r) => r.score_delta !== null && r.score_delta > 0,
  ).length;
  const unchanged = caseResults.filter((r) => r.status === "unchanged").length;

  const scoredIds = matchedIds.filter((id) => {
    const base = baselineById.get(id) as SnapshotEntry;
    const curr = currentById.get(id) as SnapshotEntry;
    return base.score !== undefined && curr.score !== undefined;
  });
  let baselineAvg: number | null = null;
  let currentAvg: number | null = null;
  if (scoredIds.length > 0) {
    const baseSum = scoredIds.reduce(
      (sum, id) => sum + ((baselineById.get(id) as SnapshotEntry).score as number),
      0,
    );
    const currSum = scoredIds.reduce(
      (sum, id) => sum + ((currentById.get(id) as SnapshotEntry).score as number),
      0,
    );
    baselineAvg = round4(baseSum / scoredIds.length);
    currentAvg = round4(currSum / scoredIds.length);
  }

  return {
    total_baseline: validBaseline.length,
    total_current: validCurrent.length,
    matched: caseResults.length,
    unchanged,
    changed: caseResults.length - unchanged,
    added,
    removed,
    case_results: caseResults,
    regressions,
    improved_count: improvedCount,
    baseline_avg_score: baselineAvg,
    current_avg_score: currentAvg,
    verdict: regressions.length > 0 ? "fail" : "pass",
  };
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
