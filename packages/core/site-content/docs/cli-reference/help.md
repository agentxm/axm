---
title: axm help
description: Show help topics and schema reference output.
---

# axm help

Show help topics and schema reference output.

## When to use

Use this when you need conceptual guidance, manifest schemas, or command-line help.

## Usage

```bash
axm help [flags] [<topic>]
```

## Arguments

| Name    | Type   | Required | Description                                        |
| ------- | ------ | -------- | -------------------------------------------------- |
| `topic` | string | No       | Help topic, such as basic-usage or getting-started |

## Flags

None.

Global flags are documented on [Global flags](./global-flags).

## Examples

**View help topics**

```bash
axm help
```

**How to use AXM**

```bash
axm help basic-usage
```

**How to set up and configure AXM**

```bash
axm help getting-started
```

**Managing agent skills with AXM**

```bash
axm help skills
```

**Managing subagents with AXM**

```bash
axm help subagents
```

**Print the skill manifest JSON Schema**

```bash
axm help skill-schema
```

**Exit code conventions**

```bash
axm help exit-codes
```

## Subcommands

None.

## Requirements

None.

## Side effects

None.
