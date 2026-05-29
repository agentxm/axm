---
title: axm sync
description: Reconcile configured workspace extensions into agent files.
---

# axm sync

Reconcile configured workspace extensions into agent files.

## When to use

Use this after changing settings, lockfiles, or agent targets to make local artifacts match.

## Usage

```bash
axm sync [flags]
```

## Arguments

None.

## Flags

| Name        | Type    | Required | Description                                                                 |
| ----------- | ------- | -------- | --------------------------------------------------------------------------- |
| `--scope`   | choice  | No       | Sync project (default) or user-level configuration (choices: project, user) |
| `--dry-run` | boolean | No       | Preview the materialization plan without applying it                        |

Global flags are documented on [Global flags](./global-flags).

## Examples

**Rebuild managed workspace files from .axm/axm-lock.yaml**

```bash
axm sync
```

**Preview what would be materialized without writing files**

```bash
axm sync --dry-run
```

**Sync the user-scope workspace**

```bash
axm sync --scope user
```

**Emit the sync result as JSON**

```bash
axm sync --json
```

## Subcommands

None.

## Requirements

- workspace
- configuredAgents

## Side effects

- writesFiles
