---
type: Surface
title: Sync command
description: The `axm sync` encounter for reconciling managed workspace state and owned
  outputs with desired state.
status: stable
tags: [cli, sync, reconciliation]
sources:
  - id: sync-architecture
    resource: https://github.com/agentxm/axm/blob/main/docs/architecture/commands/sync.md
    title: Sync
generated: { by: codex/gpt-5.6, at: "2026-08-27T02:57:19Z" }
relationships:
  is-contained-by-surface:
    - /architecture/surfaces/cli.md
---

# Sync command

## Actors and encounter boundary

People, agents, and CI use `axm sync`, its preview mode, and its convergence
assertion to compare managed workspace state with desired state and, when
selected, reconcile ready work.

## Recognizable behavior

The command realizes already authorized intent through closure-local planning,
application, rollback, and truthful partial-convergence reporting.

## Scope and exclusions

Sync does not choose or revise workspace intent, advance a satisfying accepted
resolution, claim unowned content, or provide generic repair. The [Sync
architecture](https://github.com/agentxm/axm/blob/main/docs/architecture/commands/sync.md) owns detailed
resolution, output, closure, interruption, and testing behavior.
