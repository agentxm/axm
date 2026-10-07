---
observed_at: "2026-10-07T19:59:35.224643+00:00"
session: "publication-file-selection-p7v3"
area: "GitHub Actions runner setup"
---

# APT transport timeouts did not bound a mirror fallback stall

## Context

The shared setup action used APT retry and HTTP/HTTPS timeout settings matching the upstream runner-image fix.

## Friction

A fresh CI run passed nineteen jobs, but its distribution job remained in package setup. The log confirms the new settings were supplied: APT ignored Azure metadata, read Ubuntu HTTPS release metadata, then again ignored Azure package indexes and stopped producing output for over 23 minutes. Dependency installation and tests never started.

## Outcome

After all other jobs passed, the stalled run was cancelled and its log retained. The action now removes the Azure entry from the runner's existing mirror list, preserving its configured Ubuntu HTTPS fallbacks and ARM64's separate ports mirror. Fresh verification is pending.

## Evidence

CI run 37675121900, job 112977298568, source commit 4951b3a60a8485ea745bdd1c26117eaca0c3e4dd. Last package-setup progress: 19:33:48 UTC; cancellation logged: 19:57:15 UTC on 2026-10-07.
