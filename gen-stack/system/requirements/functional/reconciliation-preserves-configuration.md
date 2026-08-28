---
type: Requirement
title: Reconciliation preserves configuration
description: Reconciliation of current workspace state with desired state never changes
  workspace configuration or advances a satisfying accepted resolution.
status: stable
tags: [workspace, reconciliation, desired-state]
requirement_id: AXM-REQ-0012
requirement_type: functional
requirement_lifecycle: active
subject: /system.md
requirement_sources:
  - https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/docs/architecture/workspace/lockfile.md
  - https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/docs/architecture/principles.md
sources:
  - id: architecture-principles
    resource: https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/docs/architecture/principles.md
    title: AXM architecture principles
  - resource: https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/docs/architecture/workspace/lockfile.md
    title: Former workspace lockfile architecture
generated: { by: claude/claude-fable-5, at: "2026-08-28T03:40:00Z" }
---

# Reconciliation preserves configuration

## Requirement

While reconciling current workspace state with desired state, the AXM System
shall not change workspace configuration and shall not advance a satisfying
accepted resolution.

## Rationale

Reconciliation exists to make current state agree with desired state, so any
configuration edit or resolution advance inside it would manufacture intent
the user never expressed. An available newer version is availability, not
permission. Advancement is bounded to satisfying accepted resolutions: a
desired external extension without a resolution may resolve once and
atomically establish one, and advancing an established satisfying resolution
belongs to expressed intent.
