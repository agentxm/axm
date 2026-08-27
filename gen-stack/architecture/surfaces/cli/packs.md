---
type: Surface
title: Pack authoring commands
description: The `axm packs add` and `axm packs remove` encounters for editing authored
  Pack dependency intent.
status: stable
tags: [cli, packs, authoring]
sources:
  - id: packs-command-architecture
    resource: https://github.com/agentxm/axm/blob/main/docs/architecture/commands/packs.md
    title: Packs
generated: { by: codex/gpt-5.6, at: "2026-08-27T02:57:19Z" }
relationships:
  is-contained-by-surface:
    - /architecture/surfaces/cli.md
---

# Pack authoring commands

## Actors and encounter boundary

Workspace authors use `axm packs add` and `axm packs remove` to edit dependency
declarations in an authored Pack manifest.

## Recognizable behavior

The commands add, update, or remove authored dependency intent while preserving
the Pack and dependency identities.

## Scope and exclusions

Pack authoring commands do not own dependency reachability, installation,
update, reconciliation, repair, or removal of realized workspace state. The
[Pack command architecture](https://github.com/agentxm/axm/blob/main/docs/architecture/commands/packs.md)
owns detailed selection, manifest editing, failure, and testing behavior.
