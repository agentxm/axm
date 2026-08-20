---
id: 2026-08-20T181228Z-q7m4
subject: axm-cli-interactions
key: update-vendored-trailing-blank-lines
observed_at: "2026-08-20T18:12:28Z"
session: unknown
kind: gap
status: open
---

**Expected:** An `axm update` result should pass the repository's Git patch whitespace check.
**Observed:** `axm update --json --non-interactive` succeeded, `axm lint --json` was clean, and sync reported convergence, but `git diff --check` reported new blank lines at EOF in 17 registry-vendored Markdown files.
**Impact:** One verification check failed and required manual classification before committing the update.
**Recovery:** Preserved the registry materializations byte-for-byte and relied on clean AXM lint and convergence checks; the requested update continued.
**Detected by:** `git diff --check`.
**Observed factors:** AXM CLI and workspace skill were both version 0.27.13; all reported paths were under updated `@agentxm` registry extensions.
**Hypothesis:** The published extension archives contain the trailing blank lines and AXM is faithfully materializing them.
**Suggests:** Consider rejecting trailing blank lines when registry extension archives are published.

Evidence: The update exited 0; AXM lint returned zero findings; sync preview returned `outcome: no-op`; Git listed 17 `new blank line at EOF` findings.
