---
type: Surface
title: Update command
description: The `axm update` encounter for advancing or rematerializing an already
  desired extension.
status: stable
tags: [cli, update, reinstall, extension-lifecycle]
sources:
  - id: update-architecture
    resource: https://github.com/agentxm/axm/blob/main/docs/architecture/commands/update.md
    title: Update
generated: { by: codex/gpt-5.6, at: "2026-08-27T02:57:19Z" }
relationships:
  is-contained-by-surface:
    - /architecture/surfaces/cli.md
---

# Update command

## Actors and encounter boundary

People and agents use `axm update` for an already desired extension. They may
retain its current constraint, explicitly change that constraint, or select
reinstallation of the accepted external resolution.

## Recognizable behavior

The command advances an accepted resolution within durable intent or
rematerializes an exact accepted identity without changing version intent.

## Scope and exclusions

Update is not workspace authorship, unrelated recovery, or permission to bypass
accepted resolution, ownership, stale-plan, locking, or rollback boundaries.
The [Update architecture](https://github.com/agentxm/axm/blob/main/docs/architecture/commands/update.md) owns
the detailed modes, authority classification, transaction response, and tests.
