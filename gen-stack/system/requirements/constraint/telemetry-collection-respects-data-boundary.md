---
type: Requirement
title: Telemetry collection respects the data boundary
description: Telemetry payloads stay within the documented data boundary and
  never include extension content, authored instructions or Knowledge,
  credentials, secrets, or resolved secret values.
status: stable
tags: [telemetry, privacy, data-boundary]
requirement_id: AXM-REQ-0017
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

# Telemetry collection respects the data boundary

## Requirement

For telemetry collection, the AXM System shall keep every telemetry payload
within the documented telemetry data boundary; that boundary excludes
extension content, authored instructions and Knowledge, credentials, secrets,
and resolved secret values.

## Rationale

Telemetry exists for product improvement, not content capture. Excluding user
content, authored knowledge, and secret material from payloads keeps optional
observation from becoming a data-exfiltration surface.
