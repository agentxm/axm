---
id: 2026-08-29T015035Z-q7m2
subject: axm-cli-interactions
key: install-md-retains-project-layout
observed_at: "2026-08-29T01:50:35Z"
session: unknown
kind: gap
status: open
---

**Expected:** AXM 0.28.1 installation guidance should match `axm help
basic-usage`: project `axm.json`, root `axm-lock.yaml`, canonical
`agent_extensions/`, and ignored `.axm/` runtime state.
**Observed:** `packages/core/site-content/install.md` tells project setup users
to read `.axm/extensions/.../SKILL.md`, calls `.axm/` configuration, and says
`.axm/` must be committed. `axm help basic-usage` reports the current layout.
**Impact:** The repository audit found one shipped bootstrap artifact that can
direct agents to retired project paths; no retry or task delay was measured.
**Recovery:** Used the current CLI help and workspace layout implementation as
authority; the read-only audit completed without following the stale guidance.
**Detected by:** Comparing tracked installation content with `pnpm axm help
basic-usage` while auditing settings-path references.
**Observed factors:** CLI 0.28.1; `pnpm axm lint --json` exited 0 with no
findings; `agentxm-internal` imports this artifact from
`@agentxm/client-core` 0.28.1.
**Hypothesis:** The project-layout migration updated CLI help and behavior but
did not update the separately packaged installation artifact.
**Suggests:** Include shipped site content in workspace-layout consistency
verification.

Evidence: `packages/core/site-content/install.md:14,186,195,207,212-214` and
`packages/cli/help/topics/basic-usage.md:50-75` differ on project settings,
canonical package, runtime, and commit paths.
