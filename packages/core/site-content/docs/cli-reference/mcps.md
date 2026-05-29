---
title: axm mcps
description: Manage MCP server extensions.
---

# axm mcps

Manage MCP server extensions.

## When to use

Use this command family when configuring MCP servers for supported agents.

## Usage

```bash
axm mcps <subcommand> [flags]
```

## Arguments

None.

## Flags

None.

Global flags are documented on [Global flags](./global-flags).

## Examples

**Add an MCP server from the registry**

```bash
axm mcps install @acme/mcps/my-server
```

**Remove an MCP server**

```bash
axm mcps uninstall my-server
```

**Bump an MCP server version**

```bash
axm mcps version @acme/mcps/my-server patch
```

## Subcommands

| Command                                   | Summary                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| [axm mcps install](#axm-mcps-install)     | Reinstall configured MCP servers from their sources, or install an MCP server from a registry |
| [axm mcps uninstall](#axm-mcps-uninstall) | Uninstall an MCP server                                                                       |
| [axm mcps list](#axm-mcps-list)           | List installed MCP servers                                                                    |
| [axm mcps enable](#axm-mcps-enable)       | Enable a disabled MCP server                                                                  |
| [axm mcps disable](#axm-mcps-disable)     | Disable an MCP server                                                                         |
| [axm mcps update](#axm-mcps-update)       | Update MCP servers                                                                            |
| [axm mcps new](#axm-mcps-new)             | Create a new MCP server                                                                       |
| [axm mcps publish](#axm-mcps-publish)     | Publish an MCP server                                                                         |
| [axm mcps version](#axm-mcps-version)     | Bump a managed MCP server manifest version                                                    |

### axm mcps install

Reinstall configured MCP servers from their sources, or install an MCP server from a registry

```bash
axm mcps install [flags] [<source>]
```

### axm mcps uninstall

Uninstall an MCP server

```bash
axm mcps uninstall [flags] <name>
```

### axm mcps list

List installed MCP servers

```bash
axm mcps list [flags]
```

### axm mcps enable

Enable a disabled MCP server

```bash
axm mcps enable [flags] <name>
```

### axm mcps disable

Disable an MCP server

```bash
axm mcps disable [flags] <name>
```

### axm mcps update

Update MCP servers

```bash
axm mcps update [flags] [<source>]
```

### axm mcps new

Create a new MCP server

```bash
axm mcps new [flags] <name>
```

### axm mcps publish

Publish an MCP server

```bash
axm mcps publish [flags] <name>
```

### axm mcps version

Bump a managed MCP server manifest version

```bash
axm mcps version [flags] <handle> <bump> [<version>]
```

## Requirements

- workspace

## Side effects

None.
