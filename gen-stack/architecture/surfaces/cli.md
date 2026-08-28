---
type: Surface
title: AXM CLI
description: The installed command-line encounter point through which people and agents
  use AXM behavior.
status: stable
tags: [cli, commands, interaction-surface]
sources:
  - id: axm-overview
    resource: https://github.com/agentxm/axm/blob/main/docs/architecture/overview.md
    title: AXM overview
  - id: command-overview
    resource: https://github.com/agentxm/axm/blob/main/docs/architecture/commands/overview.md
    title: AXM command architecture
generated: { by: codex/gpt-5.6, at: "2026-08-27T02:57:19Z" }
relationships:
  contains-surface:
    - /architecture/surfaces/cli/help.md
    - /architecture/surfaces/cli/install.md
    - /architecture/surfaces/cli/lint.md
    - /architecture/surfaces/cli/packs.md
    - /architecture/surfaces/cli/publish.md
    - /architecture/surfaces/cli/sync.md
    - /architecture/surfaces/cli/uninstall.md
    - /architecture/surfaces/cli/update.md
  is-subject-of-requirement:
    - /architecture/surfaces/cli/requirements/constraint/force-bypasses-only-forceable-policies.md
    - /architecture/surfaces/cli/requirements/functional/machine-mode-never-prompts.md
    - /architecture/surfaces/cli/requirements/functional/output-channel-separation.md
    - /architecture/surfaces/cli/requirements/functional/project-workspace-settings-validity-prerequisite.md
---

# AXM CLI

## Actors and encounter boundary

People and coding agents encounter AXM through the installed `axm` command
tree. Command definitions own the exact paths, arguments, flags, aliases, and
examples exposed by the current Implementation.

## Recognizable behavior

The CLI lets actors express durable workspace choices, inspect and reconcile
workspace state, author and publish extensions, and access type-specific
capabilities. Human and machine output present the same operation through
different rendering contracts.

## Scope and exclusions

The CLI does not install or administer coding-agent products, run extension
runtimes, infer choices an actor has not expressed, or provide a generic
workspace repair system.

## Requirements

Canonical obligations owned by this Surface are navigable under
[AXM CLI Requirements](cli/requirements/index.md).

## Interaction hierarchy and evidence

Accepted narrower command Surfaces are navigable under [AXM CLI command
surfaces](cli/index.md). The [command architecture](https://github.com/agentxm/axm/tree/main/docs/architecture/commands)
owns detailed responsibilities, state transitions, failure behavior, and
testing strategies without redefining this encounter boundary.
