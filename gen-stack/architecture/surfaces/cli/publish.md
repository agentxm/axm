---
type: Surface
title: Publish command
description: The `axm publish` encounter for validating and distributing
  workspace-authored extensions.
status: stable
tags: [cli, publish, distribution]
sources:
  - id: publish-architecture
    resource: https://github.com/agentxm/axm/blob/main/docs/architecture/commands/publish.md
    title: Publish
generated: { by: codex/gpt-5.6, at: "2026-08-27T02:57:19Z" }
relationships:
  is-contained-by-surface:
    - /architecture/surfaces/cli.md
---

# Publish command

## Actors and encounter boundary

Workspace authors use `axm publish` and its preview to select, validate, and
distribute workspace-authored extensions through a Registry.

## Recognizable behavior

The command applies the fixed publication gate, obtains exact authorization,
uploads immutable artifacts, and reports each selected outcome without
overstating remote rollback.

## Scope and exclusions

Publish is not installed-state repair, projection reconciliation, authority
adoption, or manifest rewriting. The [Publish
architecture](https://github.com/agentxm/axm/blob/main/docs/architecture/commands/publish.md) owns detailed
selection, eligibility, authorization, execution, recovery, and testing
behavior.
