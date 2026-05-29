---
title: axm commands
description: Manage slash-command extensions.
---

# axm commands

Manage slash-command extensions.

## When to use

Use this command family when adding reusable slash commands to configured coding agents.

## Usage

```bash
axm commands <subcommand> [flags]
```

## Arguments

None.

## Flags

None.

Global flags are documented on [Global flags](./global-flags).

## Examples

**Add a command from the registry**

```bash
axm commands install @acme/commands/my-cmd
```

**List installed commands**

```bash
axm commands list
```

**Enable a disabled command**

```bash
axm commands enable my-cmd
```

**Remove a command**

```bash
axm commands uninstall my-cmd
```

**Scaffold a new command**

```bash
axm commands new my-cmd
```

**Publish a command to a registry**

```bash
axm commands publish @acme/commands/my-cmd
```

**Bump a command version**

```bash
axm commands version @acme/commands/my-cmd patch
```

## Subcommands

| Command                                           | Summary                                                                                |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [axm commands install](#axm-commands-install)     | Reinstall configured commands from their sources, or install a command from a registry |
| [axm commands uninstall](#axm-commands-uninstall) | Uninstall a command                                                                    |
| [axm commands list](#axm-commands-list)           | List installed commands                                                                |
| [axm commands enable](#axm-commands-enable)       | Enable a previously disabled command                                                   |
| [axm commands disable](#axm-commands-disable)     | Disable a command without uninstalling it                                              |
| [axm commands update](#axm-commands-update)       | Update installed commands to latest versions                                           |
| [axm commands new](#axm-commands-new)             | Create a new command                                                                   |
| [axm commands version](#axm-commands-version)     | Bump a managed command manifest version                                                |
| [axm commands publish](#axm-commands-publish)     | Publish command extensions to a registry                                               |

### axm commands install

Reinstall configured commands from their sources, or install a command from a registry

```bash
axm commands install [flags] [<source>]
```

### axm commands uninstall

Uninstall a command

```bash
axm commands uninstall [flags] <name>
```

### axm commands list

List installed commands

```bash
axm commands list [flags]
```

### axm commands enable

Enable a previously disabled command

```bash
axm commands enable [flags] <name>
```

### axm commands disable

Disable a command without uninstalling it

```bash
axm commands disable [flags] <name>
```

### axm commands update

Update installed commands to latest versions

```bash
axm commands update [flags] [<name>]
```

### axm commands new

Create a new command

```bash
axm commands new [flags] <name>
```

### axm commands version

Bump a managed command manifest version

```bash
axm commands version [flags] <handle> <bump> [<version>]
```

### axm commands publish

Publish command extensions to a registry

```bash
axm commands publish [flags] <extensions...>
```

## Requirements

- workspace

## Side effects

None.
