---
type: Surface
title: Install command
description: The `axm install` encounter for expressing direct extension intent and
  realizing affected workspace state.
status: stable
tags: [cli, install, extension-lifecycle]
sources:
  - id: install-architecture
    resource: https://github.com/agentxm/axm/blob/main/docs/architecture/commands/install.md
    title: Install
generated: { by: codex/gpt-5.6, at: "2026-08-27T02:57:19Z" }
relationships:
  is-contained-by-surface:
    - /architecture/surfaces/cli.md
---

# Install command

## Actors and encounter boundary

People and agents use `axm install` or its type-specific form to express that
an extension is directly desired in the selected workspace scope.

## Recognizable behavior

The command records direct workspace intent and realizes the selected extension
and the other extensions that must change with it.

## Scope and exclusions

Install is not an unrelated-state repair, publication, native-content adoption,
or general version-advancement surface. The [Install architecture](https://github.com/agentxm/axm/blob/main/docs/architecture/commands/install.md)
owns its detailed resolution, mutation-closure, ownership, failure, and testing
response.
