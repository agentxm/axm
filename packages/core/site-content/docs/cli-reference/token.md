---
title: axm token
description: Print or manage authentication tokens.
---

# axm token

Print or manage authentication tokens.

## When to use

Use this for scripting, CI, and token lifecycle management.

## Usage

```bash
axm token <subcommand> [flags]
```

## Arguments

None.

## Flags

None.

Global flags are documented on [Global flags](./global-flags).

## Examples

**Print your auth token (e.g., for piping to another tool)**

```bash
axm auth token
```

**Same command via shortcut**

```bash
axm token
```

**Get the token as structured JSON**

```bash
axm auth token --json
```

## Subcommands

| Command                               | Summary                        |
| ------------------------------------- | ------------------------------ |
| [axm token create](#axm-token-create) | Create a granular access token |
| [axm token list](#axm-token-list)     | List granular access tokens    |
| [axm token revoke](#axm-token-revoke) | Revoke a granular access token |

### axm token create

Create a granular access token

```bash
axm token create [flags]
```

### axm token list

List granular access tokens

```bash
axm token list [flags]
```

### axm token revoke

Revoke a granular access token

```bash
axm token revoke [flags] <id>
```

## Requirements

- auth

## Side effects

None.
