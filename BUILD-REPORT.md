# evalsnap — Build Report

MCP Rebuild 1000, Batch 13. Original program build from the
packages-100 plan (cluster C #33), built from the spec in
`~/workspace/mcp-rebuild-100/specs-batch13/evalsnap.md` (read
first). There is no external original; the tool surface is the
program's defined spec. Local build only — nothing pushed or
published.

Identity: repo `evalsnap`, npm `@reneturcios/evalsnap`,
MCP name `io.github.CloudCorpRecords/evalsnap`, version
`0.1.0`, bin `evalsnap` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json`, `server.json` (description "Snapshot diff
  for agent and tool outputs: changed cases, score
  regressions, pass/fail verdict.", 94 chars ≤100; npm entry
  carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/evalsnap:0.1.0` carries **no**
  `version` field), `Dockerfile` (node:20-alpine two-stage,
  label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/evalsnap"`),
  `tsconfig.json`, `.gitignore`, `LICENSE` (MIT, Copyright
  (c) 2026 Rene Turcios), `README.md` (fresh text),
  `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27),
  `package-lock.json` (Route 3, see below)
- `src/index.ts`, `src/cli.ts` (`diff --input <args.json>`
  where the file holds the full arguments object, `mcp`,
  `--version`; exit 2 usage / 1 runtime error, argument
  validation before any file read), `src/mcp.ts`,
  `src/types.ts`, `src/evalsnap.ts` (core,
  `VERSION = "0.1.0"`)
- `test/evalsnap.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (publish-container `IMAGE = ghcr.io/cloudcorprecords/evalsnap`)

## Tools implemented (1)

- `diff_snapshots` — arguments: `baseline` (array, required,
  minItems 1) and `current` (array, required, minItems 1),
  each entry `{case_id (string, required, non-empty, unique
  within the side), output (string, required), score
  (number, optional), duration_ms (number, optional,
  minimum 0)}`.

  Returns `{total_baseline, total_current, matched,
  unchanged, changed, added, removed, case_results,
  regressions, improved_count, baseline_avg_score,
  current_avg_score, verdict}`: entries matched by case_id;
  per matched case `status` is "unchanged" on exact output
  equality else "changed", `score_delta` /
  `duration_delta_ms` are rounded to 4 dp when both sides
  carry the value and null otherwise, and `regression` is
  true exactly when `score_delta` is not null and < 0;
  `case_results`, `added`, `removed`, and `regressions` are
  sorted by case_id ascending; `improved_count` counts
  matched cases with `score_delta > 0`; the averages cover
  each side over the matched both-scores set and are both
  null when that set is empty; `verdict` is "fail" when
  regressions is non-empty, else "pass".

  The fixture literal
  (`harness/fixtures/evalsnap-tools-original.json`) and the
  `src/mcp.ts` literal are identical, with no `$schema` and
  no `additionalProperties`.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with an
  explicit inputSchema literal exactly matching the fixture,
  per the standing fleet rule (no McpServer/zod schema
  conversion). Every `tools/call` is validated by the core
  itself, so the MCP and CLI paths share one validation
  implementation.
- Validation is path-naming and total: missing/empty
  baseline or current, an entry missing case_id/output, an
  empty case_id, a duplicate case_id within one side, a
  non-number score, or a negative duration_ms throws an
  Error naming the offending path and side (e.g.
  `baseline[2].case_id duplicates baseline[0]`) and
  produces no partial result (MCP: `isError`; CLI: exit 1).
- Local choices where the spec is silent (see also
  "Gaps"): `matched`, `unchanged`, and `changed` in the
  output object are counts, while `added` and `removed`
  are the case_id lists the spec describes; an empty-string
  `output` is accepted because the spec requires `output`
  as a string without a non-empty constraint (only
  `case_id` is specified non-empty).

## Verification (foreground, this session)

- `npx tsc` exit 0 (`dist/cli.js` built)
- `npm test` (`tsx --test test/*.test.ts`): **22 tests,
  22 pass, 0 fail** — matched/added/removed classification
  with sorted lists, unchanged vs changed by exact
  equality, score and duration deltas rounded to 4 dp,
  null deltas when one side lacks a value (both
  directions), zero deltas not flagged as regressions,
  regression exactly on a negative score delta,
  improved_count, averages over the both-scores matched
  set with 4-dp rounding and the both-null case, verdict
  fail on regression and pass with added/removed only,
  and the validation/error paths (missing/empty sides,
  missing case_id/output naming side and path, empty
  case_id, duplicate case_id naming both indexes on each
  side, non-number score, negative/non-number
  duration_ms, non-string output, non-object entry)
- `dist/cli.js --version` → `0.1.0`; unknown command exits
  2 with usage; `diff` with no `--input` exits 2;
  `diff --input <valid file>` exits 0 and prints the diff
  JSON (verified by hand: totals 3/3, matched 2,
  unchanged 1, changed 1, added ["new"], removed
  ["gone"], case a delta +0.05 / -10 ms, case b delta
  -0.1 / +10 ms with regression, improved_count 1,
  averages 0.7 / 0.675, verdict "fail");
  `diff --input <invalid file>` (duplicate baseline
  case_id) exits 1 with
  `baseline[1].case_id duplicates baseline[0]` on stderr
- Parity: `harness/parity.py` vs
  `harness/fixtures/evalsnap-tools-original.json` →
  **PASS, parity 100.0, identical_tools 1/1**

## Lockfile status

`package-lock.json` generated clean via Route 3 (temp copy
without `node_modules`/`dist`/`package-lock.json`, offline
`npm install --package-lock-only --ignore-scripts
--offline`), verified: parses, name
`@reneturcios/evalsnap`, **128 package entries**. Local
`node_modules` was installed via `npm install
--ignore-scripts --offline` for build/test; gitignored.

## Gaps / honest notes

- **Output field types:** the spec lists the output object
  field names and separately describes `added` / `removed`
  as case_id lists, without explicitly typing `matched`,
  `unchanged`, and `changed`. Counts are the natural
  reading alongside `total_baseline` / `total_current` /
  `improved_count`, and that reading is implemented and
  pinned by tests.
- **Empty output string:** accepted (see Implementation
  notes); the spec constrains only `case_id` to be
  non-empty.
- Container build not exercised locally; the
  publish-container workflow smoke-tests the image at
  publish time.
- Nothing pushed or published; this is a local build only.
