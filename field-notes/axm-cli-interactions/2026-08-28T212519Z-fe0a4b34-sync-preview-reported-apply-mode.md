---
id: 2026-08-28T212519Z-fe0a4b34
subject: axm-cli-interactions
key: sync-preview-reported-apply-mode
observed_at: "2026-08-28T21:25:19Z"
session: 90e3397d
kind: gap
status: open
---

**Expected:** `axm sync --preview --fail-on-change --json` would identify its
structured result mode as preview.
**Observed:** The command returned a successful no-op result but reported
`mode: apply` and applied atomicity despite the preview flag.
**Impact:** No files changed, but the result's mode field could not by itself
demonstrate that the requested read-only boundary was honored.
**Recovery:** Confirm the post-update worktree remained unchanged by the sync
check and retain the command, zero counts, no-op outcome, and exit status
together.
**Detected by:** Inspection of the complete structured sync result.
**Observed factors:** AXM CLI 0.28.1; project workspace; `--preview`;
`--fail-on-change`; outcome `no-op`; all counts zero; exit status 0.
**Diagnostic evidence:** Contract `plan-result-v3`; mode `apply`; message
`Workspace materialization is up to date`; declared and applied atomicity
`closure-atomic`.
**Hypothesis:** The no-op result path may reuse the apply-mode label for preview
invocations.

Evidence: Live AXM help defines `--preview` as non-applying, the invocation
used that flag, and the structured result reported apply mode while producing
no worktree changes.
