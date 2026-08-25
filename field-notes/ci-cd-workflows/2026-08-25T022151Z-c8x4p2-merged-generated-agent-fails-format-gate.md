---
id: 2026-08-25T022151Z-c8x4p2
subject: ci-cd-workflows
key: merged-generated-agent-fails-format-gate
observed_at: "2026-08-25T02:21:51Z"
session: c8x4p2
kind: workaround
status: open
---

**Expected:** A merge of current `origin/main` into the CLI campaign branch
should pass the repository's affected format gate without changing files that
already landed on `main`.
**Observed:** The pre-commit `axm:verify-affected` target reached
`pnpm exec nx format:check` and rejected the newly merged generated projection
`.claude/agents/researcher.md` as unformatted.
**Impact:** The second merge-commit attempt failed and required an additional
repository formatting pass; elapsed time was not measured.
**Recovery:** Run the repository's affected formatter, stage its result, and
retry the merge commit; recovery had not yet run when captured.
**Detected by:** The pre-commit target's non-zero format-check result.
**Observed factors:** The file came from current `origin/main`; the only manual
merge resolution was in `AGENTS.md`; lint-staged did not select generated files
under `.claude`; generation and Nx sync checks passed immediately before the
format check.
**Diagnostic evidence:** Failing process: `git commit --no-edit`; process exit:
1; failing target: `axm:verify-affected`; failing command:
`pnpm exec nx format:check`; affected artifact:
`.claude/agents/researcher.md`; request or correlation ID: not supplied; attempt
count: 2; retryability: safe after repository formatting; retry stop reason:
format gate failed.
**Hypothesis:** The generated projection bytes on `main` and this repository's
Prettier policy are not aligned.
**Suggests:** Validate generated agent projections against the repository
formatter before they land.

Evidence: the generation and sync checks succeeded, then the format gate printed
only `.claude/agents/researcher.md` and exited non-zero.
