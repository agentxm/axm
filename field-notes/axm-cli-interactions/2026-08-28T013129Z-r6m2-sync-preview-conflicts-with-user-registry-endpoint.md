---
id: 2026-08-28T013129Z-r6m2
subject: axm-cli-interactions
key: sync-preview-conflicts-with-user-registry-endpoint
observed_at: "2026-08-28T01:31:29Z"
session: codex-20260828-p8k3
kind: blocked
status: open
---

**Expected:** After repairing the missing instruction projection, the AXM
skill's convergence check `./scripts/axm-local sync --preview --fail-on-change
--json` should inspect project state without an unrelated source conflict.
**Observed:** The preview exited 6 with code `conflict`: lockfile Registry source
`agentxm` accepts `https://registry.agentxm.ai/`, while configuration resolved it
to `http://localhost:4300/`.
**Impact:** Workspace-sync convergence could not be verified for the push
recovery; the already-completed lint verification remained clean.
**Recovery:** No configuration mutation was attempted because user-scope source
selection was outside the authorized repository repair. Progress continued with
the repository's actual pre-push lint gate.
**Detected by:** The AXM skill-required post-repair sync preview.
**Observed factors:** Local AXM version and skill compatibility were `0.28.1` and
compatible; project lint returned zero findings before the preview; the conflict
compared an accepted production endpoint with a configured localhost endpoint.
**Diagnostic evidence:** Process exit 6, error code `conflict`, operation
`sync --preview --fail-on-change --json`; no mutation was reported.
**Hypothesis:** User-scope Registry configuration is being applied to a
project-state convergence check whose lockfile accepts a different endpoint.
**Suggests:** Allow a project convergence check to distinguish or explicitly
override user development Registry selection without editing user settings.

Evidence: The structured conflict result followed successful projection repair
and a clean JSON lint result in the same AXM checkout.
