---
id: 2026-08-29T182500Z-m7q2
subject: axm-cli-interactions
key: pnpm-axm-json-stdout-banner
observed_at: "2026-08-29T18:25:00Z"
session: m7q2
kind: workaround
status: open
---

**Expected:** Piping `pnpm axm lint --json` (the invocation form the
testing-strategy migration document prescribes for cutover verification)
into a JSON parser should yield one parseable machine document.
**Observed:** The parse failed with `JSONDecodeError: Extra data` because
pnpm writes its script banner (`$ bun packages/cli/src/main.ts …`) onto
stdout alongside the machine document.
**Impact:** Two verification pipelines failed and had to be rerun; the
migration document's verbatim commands do not produce parseable output when
piped.
**Recovery:** Reran with `pnpm --silent axm … --json`; all subsequent machine
invocations parsed cleanly and the task completed.
**Detected by:** `python3 -c "json.load(sys.stdin)"` raised on the piped
stream.
**Observed factors:** pnpm 11.20.0 running the `axm` script from the
repository root; the CI workflow already uses `pnpm --silent axm:local` for
its jq pipeline, so the working form exists in-repo but not in the migration
document's commands.
**Diagnostic evidence:** Failing surfaces `pnpm axm lint --json` and
`pnpm axm sync --preview --fail-on-change --json`; parser error
`Extra data: line 81 column 1 (char 2518)`; recovery surface
`pnpm --silent axm <command> --json` exit 0.
**Hypothesis:** pnpm's run-script banner goes to stdout, so any documented
`pnpm axm … --json` pipeline needs `--silent` to keep the machine channel
clean.
**Suggests:** Document `pnpm --silent axm … --json` as the machine-output
invocation form wherever repository docs prescribe piping.
