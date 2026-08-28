---
id: 2026-08-28T013034Z-p8k3
subject: axm-cli-interactions
key: pre-push-requires-missing-instruction-projection
observed_at: "2026-08-28T01:30:34Z"
session: codex-20260828-p8k3
kind: blocked
status: open
---

**Expected:** A no-op push from a clean, synchronized AXM `main` checkout should
pass the repository pre-push gate without requiring untracked generated state.
**Observed:** The pre-push hook ran `./scripts/axm-local lint --strict`, reported
`workspace/instructions-target-current` for missing `./CLAUDE.md`, and exited 1.
**Impact:** The authorized push was blocked and required one additional local
repair and verification sequence.
**Recovery:** `./scripts/axm-local lint --fix --json` regenerated the determined
projection; a subsequent JSON lint returned zero findings.
**Detected by:** `git push origin main` invoking the repository pre-push hook.
**Observed factors:** The worktree was clean, local and remote `main` were equal,
the missing file was an agent projection, and both installed and local AXM
reported version `0.28.1` with compatible skill metadata.
**Diagnostic evidence:** Git push exited 1. The hook reported one auto-fixable
warning with rule ID `workspace/instructions-target-current`, subject
`./CLAUDE.md`, and recovery `axm lint --fix`.
**Hypothesis:** The pre-push gate assumes instruction projections have already
been materialized even when the tracked checkout itself is clean.
**Suggests:** Make the clean-checkout pre-push path converge determined
instruction projections before applying strict lint, or document the required
materialization precondition.

Evidence: The failed no-op push, structured lint result, and successful lint fix
were observed in the AXM repository at the same `main` revision.
