---
type: Requirement
title: Lock state never creates reachability
description: Authoritative lock state never makes an extension or workspace capability
  desired, reachable, or retained.
status: stable
tags: [workspace, lockfile, desired-state]
requirement_id: AXM-REQ-0013
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

# Lock state never creates reachability

## Requirement

The AXM System shall never create desired-state reachability from
authoritative lock state; a lock row shall not make an extension or workspace
capability desired, reachable, or retained.

## Rationale

The lockfile owns accepted external resolution and nothing else; letting lock
state create reachability would let stale or tampered artifacts manufacture
intent and silently re-accept content the user never resolved. Settings and
workspace-authored manifests remain the only authority for desired intent and
reachability.
