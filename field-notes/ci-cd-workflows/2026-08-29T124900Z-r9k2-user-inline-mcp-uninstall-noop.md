---
id: 2026-08-29T124900Z-r9k2
subject: ci-cd-workflows
key: user-inline-mcp-uninstall-noop
observed_at: "2026-08-29T12:49:00Z"
session: r9k2
kind: workaround
status: open
---

**Expected:** The Windows workspace lifecycle job on release pull request 214 should remove a user-scoped inline MCP server from both desired state and the Hermes projection.
**Observed:** Job `99101520874` in run `33252877457` reported success from `mcps uninstall windows-user-demo`, but the Hermes configuration still contained the server and the assertion failed.
**Impact:** The release pull request could not merge, and the release candidate needed a lifecycle correction plus another CI cycle.
**Recovery:** Reproduce the behavior with an isolated user home, separate configuration presence from package-source presence in the extension manager contract, and rerun the failing lifecycle in CI.
**Detected by:** GitHub pull-request CI and a local isolated CLI reproduction.
**Observed factors:** The user-scoped MCP declaration used an inline command and therefore had no Registry or workspace package source; uninstall returned `not installed` and left both settings and the Hermes projection unchanged.
**Diagnostic evidence:** Windows lifecycle job exit status 1; local reproduction retained the MCP entry before the correction; focused regression test failed because `materializeUninstall` was never called.
**Hypothesis:** Generic uninstall treated the absence of a configured package source as the absence of a desired-state declaration.

Evidence: GitHub Actions job `99101520874` in run `33252877457`, the isolated user-scope reproduction, and the focused extension-operation regression test.
