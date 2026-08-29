---
id: 2026-08-29T060804Z-k7m2
subject: axm-cli-interactions
key: acquired-edit-invalidates-lock
observed_at: "2026-08-29T06:08:04Z"
session: unknown
kind: workaround
status: open
---

**Expected:** The in-flight CLI would validate the adjacent extension workspace after stale acquired-package path metadata was corrected.
**Observed:** `./scripts/axm-local -C <workspace> lint --json` exited 1 with 11 `workspace/desired-state-reconcilable` and `workspace/knowledge-state-valid` errors; every edited acquired package reported `materialization-mismatch`.
**Impact:** Validation required reverting 16 acquired-package edits and narrowing the adjacent-repository change to canonical source. One lint run and one recovery edit were added.
**Recovery:** Restore tracked acquired packages, retain only the canonical `@agentxm/skills/axm` source edit, and validate that package separately.
**Detected by:** `axm lint --json` structured output.
**Observed factors:** AXM CLI 0.28.1; project workspace; acquired package bytes were edited without updating accepted lock integrity.
**Diagnostic evidence:** Exit 1; 11 errors; rule IDs `workspace/desired-state-reconcilable` and `workspace/knowledge-state-valid`; reason `materialization-mismatch`.
**Hypothesis:** Acquired content is integrity-bound to `axm-lock.yaml`, so path cleanup must arrive through a package refresh rather than direct edits.

Evidence: The command loaded the project workspace successfully, reported compatible AXM skill and CLI versions, and rejected only the edited acquired package materializations.
