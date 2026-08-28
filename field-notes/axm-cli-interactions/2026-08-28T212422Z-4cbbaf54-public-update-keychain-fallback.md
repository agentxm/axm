---
id: 2026-08-28T212422Z-4cbbaf54
subject: axm-cli-interactions
key: public-update-keychain-fallback
observed_at: "2026-08-28T21:24:22Z"
session: 90e3397d
kind: gap
status: open
---

**Expected:** `axm list --outdated --json` would inspect public extension
updates without credential diagnostics.
**Observed:** The command completed successfully but emitted `OS keychain
unavailable; using restricted credential file.` while checking Registry state.
**Impact:** The warning added diagnostic noise to the update preflight; no
retry or authentication recovery was required.
**Recovery:** Retain the separate warning and successful structured result,
then continue with targeted update previews.
**Detected by:** The command's retained diagnostic output.
**Observed factors:** AXM CLI 0.28.1; project workspace; public AgentXM
Registry; `axm list --outdated --json`; exit status 0.
**Diagnostic evidence:** Warning level `warn`; the structured result was
`ok: true` and reported 16 outdated items.
**Hypothesis:** unknown

Evidence: The Registry check returned a complete outdated inventory while the
warning was emitted separately and did not alter the exit status.
