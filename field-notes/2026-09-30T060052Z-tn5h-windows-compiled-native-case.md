---
observed_at: "2026-09-30T06:00:52.334670+00:00"
session: "tn5h"
area: "CLI release verification"
---

# Windows compiled Skill install failed at a case alias

## Context

Canonical CLI 0.37.2 CI ran the compiled Windows binary against a case-aliased native Skill directory with Claude Code and Codex configured.

## Friction

The first local Skill install exited 10 with `Failed to materialize skill artifact`; the same canonical run passed the Windows portable JavaScript lifecycle suite. The normal JSON error did not expose its underlying cause.

## Outcome

The Windows binary artifact job failed, preventing the successful canonical CI required for publication. Cause remains undetermined.

## Evidence

Run 36673882244, job 109754660061, `preserves native case aliases and remaining Skill consumers`.
