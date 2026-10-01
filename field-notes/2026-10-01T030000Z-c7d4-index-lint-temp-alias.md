---
observed_at: "2026-10-01T03:00:00Z"
session: "c7d4"
area: "AXM captured Git-index lint"
---

# Index lint rejected the macOS temporary-directory alias

## Context

The capability refresh design commit ran the mandatory pre-commit Git-index lint.

## Friction

Lint failed resolving the selected workspace physical location. The captured view used a `/var/folders/...` temporary path, while the physical location was under `/private/var/...`; the read was denied as live or external state.

## Outcome

A diagnostic lint invocation reproduced the failure. Running with `TMPDIR=/private/tmp` passed the same lint and allowed the commit without disabling hooks.

## Evidence

The error named `NativeLocationError` and `captured Git-index view cannot access live or external state`.
