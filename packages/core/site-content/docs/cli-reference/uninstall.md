---
title: axm uninstall
description: Remove an installed extension from the workspace.
---

# axm uninstall

Remove an installed extension from the workspace.

## When to use

Use this when an extension should no longer be configured or materialized.

## Usage

```bash
axm uninstall [flags] <source>
```

## Arguments

| Name     | Type   | Required | Description                                          |
| -------- | ------ | -------- | ---------------------------------------------------- |
| `source` | string | Yes      | Registry FQN (@owner/<plural-type>/<name>[@version]) |

## Flags

| Name            | Type    | Required | Description                                                    |
| --------------- | ------- | -------- | -------------------------------------------------------------- |
| `--yes`, `-y`   | boolean | No       | Skip confirmation after reviewing the uninstall plan           |
| `--force`, `-f` | boolean | No       | Remove even if the extension is referenced by other extensions |
| `--preview`     | boolean | No       | Show what would be removed without making changes              |

Global flags are documented on [Global flags](./global-flags).

## Examples

**Remove an installed skill by fully qualified registry name**

```bash
axm uninstall @acme/skills/code-review
```

**Preview uninstalling a command; version is ignored for uninstall routing**

```bash
axm uninstall @acme/commands/release-notes@^1.2.0 --preview
```

**Remove a pack and skip confirmation in scripts or CI**

```bash
axm uninstall @acme/packs/frontend-tools --yes
```

## Subcommands

None.

## Requirements

- workspace

## Side effects

- mutatesWorkspace
- writesFiles
- writesLockfile
