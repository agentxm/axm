---
type: Requirement
title: Workspace changes do not interleave
description: Two AXM changes to the same workspace scope never interleave.
status: stable
tags: [workspace, concurrency, safety]
requirement_id: AXM-REQ-0011
requirement_type: functional
requirement_lifecycle: active
subject: /system.md
requirement_sources:
  - https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/docs/architecture/workspace/execution.md
  - https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/docs/architecture/principles.md
sources:
  - id: architecture-principles
    resource: https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/docs/architecture/principles.md
    title: AXM architecture principles
  - resource: https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/docs/architecture/workspace/execution.md
    title: Former workspace execution architecture
generated: { by: claude/claude-fable-5, at: "2026-08-28T03:40:00Z" }
---

# Workspace changes do not interleave

## Requirement

The AXM System shall not interleave two changes to the same workspace scope.

## Rationale

Interleaved concurrent changes can corrupt authoritative workspace state and
produce an outcome neither change expressed. The accepted safety principle
makes non-interleaving a property of every workspace-scope mutation regardless
of which command or embedding expresses it.
