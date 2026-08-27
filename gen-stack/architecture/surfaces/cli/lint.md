---
type: Surface
title: Lint command
description: The `axm lint` encounter for inspecting extension and workspace invariant
  violations.
status: stable
tags: [cli, lint, diagnostics]
sources:
  - id: lint-architecture
    resource: https://github.com/agentxm/axm/blob/main/docs/architecture/commands/lint.md
    title: Lint
generated: { by: codex/gpt-5.6, at: "2026-08-27T02:57:19Z" }
relationships:
  is-contained-by-surface:
    - /architecture/surfaces/cli.md
---

# Lint command

## Actors and encounter boundary

People and agents use `axm lint` to inspect local authoritative and observed
workspace state through human or structured findings.

## Recognizable behavior

The command explains invariant violations without guessing user intent. Its
explicit fix mode delegates only deterministic, meaning-preserving
reconciliation.

## Scope and exclusions

Lint is not inventory, network discovery, update selection, or a general
recovery workflow. The [Lint architecture](https://github.com/agentxm/axm/blob/main/docs/architecture/commands/lint.md)
owns finding semantics, repairability, rule behavior, views, and tests.
