---
title: axm view
description: View registry metadata for an extension.
---

# axm view

View registry metadata for an extension.

## When to use

Use this when inspecting a published extension before installing or updating it.

## Usage

```bash
axm view [flags] <handle> [<field>]
```

## Arguments

| Name     | Type   | Required | Description                                                         |
| -------- | ------ | -------- | ------------------------------------------------------------------- |
| `handle` | string | Yes      | Fully-qualified extension handle (@owner/skills/name)               |
| `field`  | string | No       | Optional field: version, versions, latest, description, owner, type |

## Flags

| Name         | Type   | Required | Description                                                            |
| ------------ | ------ | -------- | ---------------------------------------------------------------------- |
| `--registry` | string | No       | Target a specific named registry instead of the default                |
| `--type`     | choice | No       | Resource type for bare-name lookup (choices: skill, command, subagent) |

Global flags are documented on [Global flags](./global-flags).

## Examples

**Show published metadata for an extension**

```bash
axm view @acme/skills/code-review
```

**Print the latest published version**

```bash
axm view @acme/commands/my-cmd version
```

**Emit published versions as JSON**

```bash
axm view @acme/skills/code-review versions --json
```

## Subcommands

None.

## Requirements

- registry
- network

## Side effects

None.
