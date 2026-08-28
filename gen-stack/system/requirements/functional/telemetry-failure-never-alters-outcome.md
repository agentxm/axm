---
type: Requirement
title: Telemetry failure never alters outcomes
description: Telemetry failure never alters a requested operation's output,
  state changes, or exit status.
status: stable
tags: [telemetry, failure-isolation, reliability]
requirement_id: AXM-REQ-0016
requirement_type: functional
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

# Telemetry failure never alters outcomes

## Requirement

If telemetry collection or delivery fails, then the AXM System shall not alter
the requested operation's output, state changes, or exit status.

## Rationale

Telemetry is optional, best-effort observation, and a requested operation's
outcome must not depend on it. Failure isolation keeps collection and
transport failures invisible to the operation.
