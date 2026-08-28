---
type: Requirement
title: Workspace configuration cannot enable telemetry
description: No workspace configuration can opt a user into AXM telemetry
  collection.
status: stable
tags: [telemetry, consent, workspace-configuration]
requirement_id: AXM-REQ-0014
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

# Workspace configuration cannot enable telemetry

## Requirement

The AXM System shall not enable telemetry collection for a user on the basis
of workspace configuration.

## Rationale

A committed workspace is shared state, so letting it enable collection would
opt in every contributor without their consent. Consent to observation must
come from the person running the CLI through their own environment, never from
repository state they did not author.
