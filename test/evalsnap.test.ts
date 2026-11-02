import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { diffSnapshots } from "../src/evalsnap.js";

/**
 * All tests are pure local computation over inline snapshots:
 * no filesystem, no network. Each behaviour in the spec is
 * pinned by its own case, including the null paths.
 */

const entry = (
  case_id: string,
  output: string,
  score?: number,
  duration_ms?: number,
) => ({
  case_id,
  output,
  ...(score !== undefined ? { score } : {}),
  ...(duration_ms !== undefined ? { duration_ms } : {}),
});

describe("diffSnapshots — matching", () => {
  it("classifies matched, added, and removed cases with sorted lists", () => {
    const out = diffSnapshots(
      [entry("b", "1"), entry("a", "1"), entry("gone", "1")],
      [entry("new", "1"), entry("a", "1"), entry("b", "1")],
    );
    assert.equal(out.total_baseline, 3);
    assert.equal(out.total_current, 3);
    assert.equal(out.matched, 2);
    assert.deepEqual(out.added, ["new"]);
    assert.deepEqual(out.removed, ["gone"]);
    assert.deepEqual(
      out.case_results.map((r) => r.case_id),
      ["a", "b"],
    );
  });

  it("sorts added and removed ascending regardless of input order", () => {
    const out = diffSnapshots(
      [entry("z-old", "1"), entry("keep", "1"), entry("a-old", "1")],
      [entry("keep", "1"), entry("z-new", "1"), entry("a-new", "1")],
    );
    assert.deepEqual(out.added, ["a-new", "z-new"]);
    assert.deepEqual(out.removed, ["a-old", "z-old"]);
  });

  it("counts unchanged vs changed by exact output equality", () => {
    const out = diffSnapshots(
      [entry("a", "same"), entry("b", "before"), entry("c", "x")],
      [entry("a", "same"), entry("b", "after"), entry("c", "x ")],
    );
    assert.equal(out.matched, 3);
    assert.equal(out.unchanged, 1);
    assert.equal(out.changed, 2);
    const byId = new Map(out.case_results.map((r) => [r.case_id, r.status]));
    assert.equal(byId.get("a"), "unchanged");
    assert.equal(byId.get("b"), "changed");
    assert.equal(byId.get("c"), "changed");
  });
});

describe("diffSnapshots — deltas and regressions", () => {
  it("computes score_delta and duration_delta_ms rounded to 4 dp", () => {
    const out = diffSnapshots(
      [entry("a", "o", 0.11111, 100)],
      [entry("a", "o", 0.33333, 145.67891)],
    );
    assert.equal(out.case_results[0].score_delta, 0.2222);
    assert.equal(out.case_results[0].duration_delta_ms, 45.6789);
  });

  it("returns null deltas when one side lacks score or duration", () => {
    const out = diffSnapshots(
      [entry("a", "o", 1, 100), entry("b", "o")],
      [entry("a", "o"), entry("b", "o", 2, 50)],
    );
    assert.equal(out.case_results[0].score_delta, null);
    assert.equal(out.case_results[0].duration_delta_ms, null);
    assert.equal(out.case_results[1].score_delta, null);
    assert.equal(out.case_results[1].duration_delta_ms, null);
  });

  it("returns a delta when both sides carry the value, including zero", () => {
    const out = diffSnapshots(
      [entry("a", "o", 0, 0)],
      [entry("a", "o", 0, 0)],
    );
    assert.equal(out.case_results[0].score_delta, 0);
    assert.equal(out.case_results[0].duration_delta_ms, 0);
    assert.equal(out.case_results[0].regression, false);
  });

  it("marks regression exactly when score_delta is negative", () => {
    const out = diffSnapshots(
      [entry("down", "o", 0.9), entry("flat", "o", 0.5), entry("up", "o", 0.1)],
      [entry("down", "o", 0.8), entry("flat", "o", 0.5), entry("up", "o", 0.4)],
    );
    const byId = new Map(out.case_results.map((r) => [r.case_id, r.regression]));
    assert.equal(byId.get("down"), true);
    assert.equal(byId.get("flat"), false);
    assert.equal(byId.get("up"), false);
    assert.deepEqual(out.regressions, ["down"]);
    assert.equal(out.improved_count, 1);
  });

  it("does not mark regression when score_delta is null", () => {
    const out = diffSnapshots(
      [entry("a", "before", 0.9)],
      [entry("a", "after")],
    );
    assert.equal(out.case_results[0].score_delta, null);
    assert.equal(out.case_results[0].regression, false);
    assert.deepEqual(out.regressions, []);
  });

  it("counts every improved matched case", () => {
    const out = diffSnapshots(
      [entry("a", "o", 1), entry("b", "o", 1), entry("c", "o", 1)],
      [entry("a", "o", 2), entry("b", "o", 1.5), entry("c", "o", 1)],
    );
    assert.equal(out.improved_count, 2);
  });
});

describe("diffSnapshots — averages and verdict", () => {
  it("averages each side over the matched both-scores set only", () => {
    const out = diffSnapshots(
      [entry("a", "o", 1), entry("b", "o", 3), entry("c", "o", 100), entry("gone", "o", 100)],
      [entry("a", "o", 2), entry("b", "o", 4), entry("c", "o"), entry("new", "o", 100)],
    );
    // Only a and b carry scores on both sides: baseline (1+3)/2, current (2+4)/2.
    assert.equal(out.baseline_avg_score, 2);
    assert.equal(out.current_avg_score, 3);
  });

  it("rounds averages to 4 decimal places", () => {
    const out = diffSnapshots(
      [entry("a", "o", 1), entry("b", "o", 2), entry("c", "o", 2)],
      [entry("a", "o", 1), entry("b", "o", 1), entry("c", "o", 1)],
    );
    assert.equal(out.baseline_avg_score, 1.6667);
    assert.equal(out.current_avg_score, 1);
  });

  it("returns both averages null when no matched case has both scores", () => {
    const out = diffSnapshots(
      [entry("a", "o", 5), entry("b", "o")],
      [entry("a", "o"), entry("b", "o", 7)],
    );
    assert.equal(out.baseline_avg_score, null);
    assert.equal(out.current_avg_score, null);
  });

  it("fails the verdict when any regression exists", () => {
    const out = diffSnapshots(
      [entry("a", "o", 1)],
      [entry("a", "o", 0.5)],
    );
    assert.equal(out.verdict, "fail");
  });

  it("passes when there are no regressions, even with added/removed cases", () => {
    const out = diffSnapshots(
      [entry("a", "o", 1), entry("gone", "o", 0)],
      [entry("a", "changed output", 1), entry("new", "o", 0)],
    );
    assert.deepEqual(out.regressions, []);
    assert.equal(out.verdict, "pass");
  });
});

describe("diffSnapshots — validation", () => {
  it("rejects missing or empty baseline/current", () => {
    assert.throws(() => diffSnapshots(undefined, [entry("a", "o")]), /baseline is required/);
    assert.throws(() => diffSnapshots([entry("a", "o")], undefined), /current is required/);
    assert.throws(() => diffSnapshots([], [entry("a", "o")]), /baseline must be a non-empty array/);
    assert.throws(() => diffSnapshots([entry("a", "o")], []), /current must be a non-empty array/);
    assert.throws(() => diffSnapshots("nope", [entry("a", "o")]), /baseline must be a non-empty array/);
  });

  it("rejects an entry missing case_id or output, naming side and path", () => {
    assert.throws(
      () => diffSnapshots([{ output: "o" }], [entry("a", "o")]),
      /baseline\[0\]\.case_id is required/,
    );
    assert.throws(
      () => diffSnapshots([entry("a", "o")], [entry("a", "o"), { case_id: "b" }]),
      /current\[1\]\.output is required/,
    );
  });

  it("rejects an empty case_id, naming side and path", () => {
    assert.throws(
      () => diffSnapshots([entry("a", "o"), entry("", "o")], [entry("a", "o")]),
      /baseline\[1\]\.case_id must be a non-empty string/,
    );
    assert.throws(
      () => diffSnapshots([entry("a", "o")], [{ case_id: 7, output: "o" }]),
      /current\[0\]\.case_id must be a non-empty string/,
    );
  });

  it("rejects a duplicate case_id within one side, naming both indexes", () => {
    assert.throws(
      () =>
        diffSnapshots(
          [entry("a", "1"), entry("b", "1"), entry("a", "2")],
          [entry("a", "1")],
        ),
      /baseline\[2\]\.case_id duplicates baseline\[0\]/,
    );
    assert.throws(
      () =>
        diffSnapshots(
          [entry("a", "1")],
          [entry("x", "1"), entry("x", "2")],
        ),
      /current\[1\]\.case_id duplicates current\[0\]/,
    );
  });

  it("allows the same case_id on opposite sides (that is a match)", () => {
    const out = diffSnapshots([entry("a", "1")], [entry("a", "1")]);
    assert.equal(out.matched, 1);
  });

  it("rejects a non-number score, naming side and path", () => {
    assert.throws(
      () => diffSnapshots([{ case_id: "a", output: "o", score: "high" }], [entry("a", "o")]),
      /baseline\[0\]\.score must be a number/,
    );
    assert.throws(
      () => diffSnapshots([entry("a", "o")], [{ case_id: "a", output: "o", score: null }]),
      /current\[0\]\.score must be a number/,
    );
  });

  it("rejects a negative or non-number duration_ms, naming side and path", () => {
    assert.throws(
      () => diffSnapshots([entry("a", "o", undefined, -1)], [entry("a", "o")]),
      /baseline\[0\]\.duration_ms must be >= 0/,
    );
    assert.throws(
      () => diffSnapshots([entry("a", "o")], [{ case_id: "a", output: "o", duration_ms: "fast" }]),
      /current\[0\]\.duration_ms must be a number/,
    );
  });

  it("rejects a non-string output and a non-object entry", () => {
    assert.throws(
      () => diffSnapshots([{ case_id: "a", output: 42 }], [entry("a", "o")]),
      /baseline\[0\]\.output must be a string/,
    );
    assert.throws(
      () => diffSnapshots(["nope"], [entry("a", "o")]),
      /baseline\[0\] must be an object/,
    );
  });
});
