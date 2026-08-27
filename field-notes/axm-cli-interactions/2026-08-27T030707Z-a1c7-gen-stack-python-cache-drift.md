---
id: 2026-08-27T030707Z-a1c7
subject: axm-cli-interactions
key: gen-stack-python-cache-drift
observed_at: "2026-08-27T03:07:07Z"
session: 01a04118-27fd-7e71-9416-9b6200baed6b
kind: gap
status: open
---

**Expected:** Repeated read-only Gen Stack mechanical checks should leave the
AXM-managed acquired package materialization unchanged.

**Observed:** Running the packaged Python validators created `__pycache__`
directories inside the acquired Gen Stack package. A subsequent
`pnpm axm lint --json` exited 1 with two
`materialization-mismatch` errors for
`@craigsmitham/knowledge/gen-stack`.

**Impact:** Workspace lint failed after a nominally read-only validation path,
requiring generated-cache cleanup and a non-bytecode wrapper environment.
One extra recovery cycle was required; elapsed delay was not measured.

**Recovery:** Set `PYTHONDONTWRITEBYTECODE=1` in the repository Gen Stack check
wrapper, remove only the generated cache files and directories, and rerun AXM
lint. Task completion remains pending.

**Detected by:** Workspace lint after adding the repository-native Gen Stack
validation wrapper and running the mechanical check.

**Observed factors:** The acquired package declares `*__pycache__*` in its
publish ignore list, but AXM canonical-state lint still observed the generated
materialization.

**Diagnostic evidence:** Command `pnpm axm lint --json`; process exit status
`1`; findings `workspace/desired-state-reconcilable` and
`workspace/knowledge-state-valid`; both identified canonical state
`materialization-mismatch` at
`agent_extensions/agentxm/@craigsmitham/knowledge/gen-stack`.

**Hypothesis:** Python bytecode caches are outside the package's canonical
materialization even though the publish configuration ignores them.
