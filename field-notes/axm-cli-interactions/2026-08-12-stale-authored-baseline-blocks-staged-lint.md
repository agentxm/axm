---
subject: axm-cli-interactions
key: stale-authored-baseline-blocks-staged-lint
date: 2026-08-12
kind: blocked
status: open
---

**Expected:** Strict staged lint would evaluate the proposed extension changes
without an unrelated main-branch baseline preventing the commit.
**Actual:** The pre-commit hook failed because the bundled
`@agentxm/skills/axm` package already differed from its recorded workspace
authoring baseline, even though this change did not edit that package.
**Gap:** A committed authored-package change can leave trust state stale and
make later unrelated commits responsible for reconciling it.
**Suggests:** Update the workspace authoring baseline in the same workflow that
changes the bundled skill, or distinguish preexisting authored drift from new
staged drift.

Evidence: the staged hook reported `workspace/authored-content-unpublished` for
`.axm/extensions/@agentxm/skills/axm`; `axm adopt @agentxm/skills/axm` updated
only lock/trust baselines and restored current workspace health.
