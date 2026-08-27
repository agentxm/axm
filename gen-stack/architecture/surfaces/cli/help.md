---
type: Surface
title: CLI help
description: The connected command and topic discovery encounter for understanding AXM
  interfaces without executing them.
status: stable
tags: [cli, help, discoverability]
sources:
  - id: help-architecture
    resource: https://github.com/agentxm/axm/blob/main/docs/architecture/commands/help.md
    title: CLI help and discoverability
generated: { by: codex/gpt-5.6, at: "2026-08-27T02:57:19Z" }
relationships:
  is-contained-by-surface:
    - /architecture/surfaces/cli.md
---

# CLI help

## Actors and encounter boundary

People and agents encounter AXM help through root help, command help, the help
topic index, exact topics, suggestions, and contextual links.

## Recognizable behavior

The connected help surface distinguishes executable command reference from
conceptual and schema guidance while preserving consistent human and machine
navigation.

## Scope and exclusions

Help explains interfaces and context; it does not execute an operation, inspect
workspace state, or choose user intent. The [CLI help
architecture](https://github.com/agentxm/axm/blob/main/docs/architecture/commands/help.md) owns resolution,
authority, freshness, output, and verification details.
