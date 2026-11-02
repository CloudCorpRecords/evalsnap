# evalsnap

You re-ran your agent and the answers look slightly different —
but did anything actually get worse? evalsnap takes two
snapshots of case outputs, a baseline run and a current run,
matches them by `case_id`, and tells you exactly what moved:

- **Matched, added, removed** — cases present on both sides,
  cases that only exist in the current run, and cases that
  disappeared from the baseline, each list sorted by id
- **Per-case results** — for every matched case: whether the
  output is unchanged or changed under exact string equality,
  the score delta and the duration delta (each `null` when
  either side did not record that measurement), and a
  regression flag that is set only when the score went down
- **Regressions and improvements** — the sorted list of
  regressed case ids and the count of cases whose score rose
- **Average scores** — each side averaged over the matched
  cases that carry a score on both sides, so the comparison
  covers the same set on both sides; both averages are `null`
  when no matched case qualifies
- **Verdict** — `fail` when at least one regression exists,
  otherwise `pass`; added and removed cases are reported but
  never fail the verdict on their own

Deltas and averages are rounded to four decimal places. The
computation is pure and local: no network, no configuration,
nothing read beyond the snapshots you pass in. Invalid input
— an empty snapshot, a case without an id or output, a
duplicate id inside one side, a non-numeric score, a negative
duration — is rejected with an error naming the offending
path and side, and no partial diff is produced.

## CLI

```bash
npx @reneturcios/evalsnap diff --input args.json
npx @reneturcios/evalsnap --version
```

`args.json` contains the full arguments object:

```json
{
  "baseline": [
    { "case_id": "greeting", "output": "hello", "score": 0.9, "duration_ms": 120 },
    { "case_id": "summary", "output": "short text", "score": 0.7 }
  ],
  "current": [
    { "case_id": "greeting", "output": "hello", "score": 0.95, "duration_ms": 110 },
    { "case_id": "summary", "output": "short text", "score": 0.6 }
  ]
}
```

`score` and `duration_ms` are optional per entry. The diff
is printed as JSON.

Exit codes: `0` on success, `1` on a runtime error (including
an unreadable or invalid input file, or invalid input), `2`
on a usage error.

## MCP server

```bash
npx -y @reneturcios/evalsnap mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "evalsnap": {
      "command": "npx",
      "args": ["-y", "@reneturcios/evalsnap", "mcp"]
    }
  }
}
```

### Tools

- `diff_snapshots` — Diff two eval snapshots matched by
  case_id.
  - `baseline` (array, required, at least one) — entries as
    `{case_id, output, score?, duration_ms?}` objects
  - `current` (array, required, at least one) — same entry
    shape

  Returns `{total_baseline, total_current, matched, unchanged,
  changed, added, removed, case_results, regressions,
  improved_count, baseline_avg_score, current_avg_score,
  verdict}`.

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/evalsnap
docker run --rm -v "$PWD:/w" ghcr.io/cloudcorprecords/evalsnap diff --input /w/args.json
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (pure local, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
