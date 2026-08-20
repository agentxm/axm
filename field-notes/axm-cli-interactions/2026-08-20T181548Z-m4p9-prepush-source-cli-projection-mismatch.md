---
id: 2026-08-20T181548Z-m4p9
subject: axm-cli-interactions
key: prepush-source-cli-projection-mismatch
observed_at: "2026-08-20T18:15:48Z"
session: unknown
kind: workaround
status: open
---

**Expected:** Clean installed-CLI lint and sync checks after `axm update` should agree with the repository's pre-push AXM check.
**Observed:** The installed AXM 0.27.13 reported zero findings and convergence, but the in-flight source CLI used by pre-push reported a missing AGENTS.md projection, stale instruction alias ignores, and three undeclared detected-agent warnings.
**Impact:** The first push was blocked and required one additional source-CLI reconciliation and commit amendment.
**Recovery:** Ran `./scripts/axm-local sync` to clear the projection and ignore drift; the three detected-agent warnings remained because changing desired agent membership was outside this update.
**Detected by:** The Husky pre-push hook running `./scripts/axm-local lint --strict`.
**Observed factors:** The workspace skill and installed CLI were both 0.27.13; repository source behavior had already removed canonical materialization markers and retained exact instruction alias paths.
**Hypothesis:** The released CLI and current repository source implement different workspace projection contracts.

Evidence: The initial push exited 1 with `workspace/projections-current`; source sync applied two steps; a subsequent source lint reported only `workspace/agents-detected-declared` warnings for codex, cursor, and gemini-cli.
