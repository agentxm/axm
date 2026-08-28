---
type: Requirement
title: Force bypasses only forceable policies
description: On every AXM command, `--force` bypasses only an explicitly named
  forceable policy and never a hard invariant.
status: stable
tags: [cli, force, overrides]
requirement_id: AXM-REQ-0007
requirement_type: constraint
requirement_lifecycle: active
subject: /architecture/surfaces/cli.md
requirement_sources:
  - https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/docs/architecture/principles.md
  - https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/docs/architecture/commands/overview.md
sources:
  - id: architecture-principles
    resource: https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/docs/architecture/principles.md
    title: AXM architecture principles
  - id: command-overview
    resource: https://github.com/agentxm/axm/blob/726f160009924ebeb02a8f5b7ebb14833e10e4ad/docs/architecture/commands/overview.md
    title: AXM command architecture
generated: { by: claude/claude-fable-5, at: "2026-08-28T03:40:00Z" }
---

# Force bypasses only forceable policies

## Requirement

The AXM CLI shall expose `--force` on a command only for an explicitly named
forceable policy that may safely be bypassed. `--force` shall bypass only that
named policy and shall never bypass ownership, accepted-resolution authority,
concurrency safety, stale-plan checks, rollback, or workspace invariants.

## Rationale

Overrides that silently widen a command's permission make workspace changes
unpredictable and unsafe to recover. The accepted override principle keeps
`--force` an exceptional escape hatch for one clearly named policy and keeps
hard invariants non-bypassable on every command. The enumerated protections
are the accepted floor within that hard-invariant category, not a closed
catalog.
