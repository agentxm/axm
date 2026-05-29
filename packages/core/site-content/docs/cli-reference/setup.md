---
title: axm setup
description: Initialize AXM management for a project or user scope.
---

# axm setup

Initialize AXM management for a project or user scope.

## When to use

Use this first in a project to choose agents and install the default AXM skill.

## Usage

```bash
axm setup [flags]
```

## Arguments

None.

## Flags

| Name            | Type    | Required | Description                                                             |
| --------------- | ------- | -------- | ----------------------------------------------------------------------- |
| `--scope`       | choice  | No       | Configuration scope: project (default) or user (choices: project, user) |
| `--agent`       | string  | No       | Specify agent(s) to configure (skips auto-detection)                    |
| `--yes`, `-y`   | boolean | No       | Auto-accept confirmation prompts                                        |
| `--force`, `-f` | boolean | No       | Override constraints that would cause failure                           |
| `--preview`     | boolean | No       | Display plan without applying                                           |

Global flags are documented on [Global flags](./global-flags).

## Examples

**Detect installed agents and create .axm/settings.json**

```bash
axm setup
```

**Initialize with all detected agents (no prompts)**

```bash
axm setup --non-interactive
```

**Initialize in ~/.axm/ for user scope**

```bash
axm setup --scope user
```

**Initialize with specific agents**

```bash
axm setup --agent claude-code --agent cursor
```

## Subcommands

None.

## Requirements

None.

## Side effects

- mutatesWorkspace
- writesFiles
- writesLockfile
