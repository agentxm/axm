---
type: Surface
title: Uninstall command
description: The `axm uninstall` encounter for removing direct extension intent while
  preserving other desired routes.
status: stable
tags: [cli, uninstall, extension-lifecycle]
sources:
  - id: uninstall-architecture
    resource: https://github.com/agentxm/axm/blob/main/docs/architecture/commands/uninstall.md
    title: Uninstall
generated: { by: codex/gpt-5.6, at: "2026-08-27T02:57:19Z" }
relationships:
  is-contained-by-surface:
    - /architecture/surfaces/cli.md
---

# Uninstall command

## Actors and encounter boundary

People and agents use `axm uninstall` to remove an extension's direct route
from workspace configuration.

## Recognizable behavior

The command recomputes desired-state reachability and preserves an extension
when another desired route still retains it.

## Scope and exclusions

Uninstall does not break remaining Pack-derived routes, delete authored or
unowned content, or act as generic repair. The [Uninstall
architecture](https://github.com/agentxm/axm/blob/main/docs/architecture/commands/uninstall.md) owns detailed
cleanup, atomicity, recovery, and testing behavior.
