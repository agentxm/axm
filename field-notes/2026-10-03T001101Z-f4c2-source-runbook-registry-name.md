---
observed_at: "2026-10-03T00:11:01Z"
session: "f4c2"
area: "source CLI runbook"
---

# Source-runbook Registry name fails settings validation

## Context

Preparing a disposable workspace for a source CLI native Hook smoke test using
`devops/runbooks/run-source-cli.md`.

## Friction

The runbook's named Registry example uses `local`. The source CLI refused the
workspace settings because the Registry name must not be an intrinsic source
name, before it could install the local Hook package.

## Outcome

Changed only the disposable fixture's Registry name and selection to `smoke`.
The next invocation passed settings decoding and reached package discovery.

## Evidence

`hooks install ../package --json` reported `SettingsDecodeError` for
`defaultRegistry` and exited 9 with the runbook's `local` name.
