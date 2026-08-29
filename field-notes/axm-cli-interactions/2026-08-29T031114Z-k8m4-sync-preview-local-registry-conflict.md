---
id: 2026-08-29T031114Z-k8m4
subject: axm-cli-interactions
key: sync-preview-local-registry-conflict
observed_at: "2026-08-29T03:11:14Z"
session: k8m4
kind: workaround
status: open
---

**Expected:** `./scripts/axm-local sync --preview --json` should preview repository-owned projection repairs without changing accepted Registry authority.
**Observed:** The wrapper supplied its localhost Registry endpoint, which conflicted with the lockfile's accepted `https://registry.agentxm.ai/` endpoint before projection planning.
**Impact:** The first synchronization preview exited before reporting projection changes and required an explicit Registry-location override.
**Recovery:** Retry with `AXM_REGISTRY_LOCATION=https://registry.agentxm.ai/` so configuration matches accepted lockfile authority.
**Detected by:** Structured CLI error output.
**Observed factors:** The Registry environment variable was unset before invoking `axm-local`; the repository lockfile already accepted the public Registry endpoint.
**Diagnostic evidence:** Exit status 6; code `conflict`; source `agentxm`; configured endpoint `http://localhost:4300/`; accepted endpoint `https://registry.agentxm.ai/`.
**Hypothesis:** The local wrapper's default Registry override is unsuitable for read-only projection reconciliation in this repository.

Evidence: The preview returned a structured conflict before a plan, naming both the configured and accepted Registry endpoints.
