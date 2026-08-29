---
id: 2026-08-29T175933Z-q6m2
subject: axm-cli-interactions
key: axm-lint-stale-subagent-projections
observed_at: "2026-08-29T17:59:33Z"
session: unknown
kind: gap
status: open
---

**Expected:** `axm lint --json` would report a clean workspace before
instruction authoring in the clean AXM checkout.
**Observed:** Lint reported stale AXM-owned projections for the `researcher`
and `reviewer` subagents.
**Impact:** The workspace-wide AXM lint preflight could not provide a green
baseline for this retirement; the unrelated projection findings were left
untouched and the task continued in an isolated worktree.
**Recovery:** No recovery was attempted because the projection state is outside
the image-retirement scope.
**Detected by:** `axm lint --json`.
**Observed factors:** CLI version 0.28.2 and workspace AXM skill version 0.28.2
were compatible; both findings used rule
`workspace/projections-current` with severity `error`.
**Diagnostic evidence:** `result.summary` reported `total: 2`, `errors: 2`,
and `exitCategory: errors`; affected contributors were
`@craigsmitham/subagents/researcher` and
`@craigsmitham/subagents/reviewer`.
**Hypothesis:** unknown

Evidence: The checkout had no Git changes when the two stale-projection
findings were returned.
