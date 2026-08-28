---
type: Requirement
title: DO_NOT_TRACK takes precedence
description: DO_NOT_TRACK disables AXM telemetry regardless of any AXM-specific
  selection or lower-precedence control.
status: stable
tags: [telemetry, consent, do-not-track]
requirement_id: AXM-REQ-0015
requirement_type: constraint
requirement_lifecycle: active
subject: /system.md
requirement_sources:
  - https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/docs/architecture/system-wide/telemetry.md
sources:
  - id: telemetry-architecture
    resource: https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/docs/architecture/system-wide/telemetry.md
    title: AXM telemetry architecture
generated: { by: claude/claude-fable-5, at: "2026-08-28T03:40:00Z" }
---

# DO_NOT_TRACK takes precedence

## Requirement

While the `DO_NOT_TRACK` environment convention requests no tracking, the AXM
System shall disable telemetry collection regardless of any AXM-specific
telemetry selection or other lower-precedence control.

## Rationale

`DO_NOT_TRACK` is a cross-tool user signal that the person running the CLI
does not consent to observation; honoring it unconditionally keeps AXM's
consent model deterministic and trustworthy. Any lower-precedence override
would convert a user-wide refusal into a tool-specific negotiation.
