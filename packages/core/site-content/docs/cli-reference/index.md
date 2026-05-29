---
title: CLI Reference
description: Generated AXM command reference.
---

# CLI Reference

Generated from AXM CLI version 0.12.3.

AXM command syntax follows this shape:

```bash
axm <command> [arguments] [flags]
```

Use `--json` when a command supports machine-readable output, and use `--preview` on mutation commands when you want to inspect the plan before writing files or changing registry state.

## Command Groups

### Extensions

- [axm skills](./skills)
- [axm commands](./commands)
- [axm context](./context)
- [axm mcps](./mcps)
- [axm subagents](./subagents)
- [axm packs](./packs)
- [axm install](./install)
- [axm update](./update)
- [axm uninstall](./uninstall)
- [axm outdated](./outdated)
- [axm view](./view)
- [axm lists](./lists)
- [axm version](./version)

### Workspace

- [axm sync](./sync)
- [axm agents](./agents)
- [axm lint](./lint)
- [axm prune](./prune)
- [axm upgrade](./upgrade)
- [axm setup](./setup)
- [axm discover](./discover)

### Authentication

- [axm auth](./auth)
- [axm login](./login)
- [axm logout](./logout)
- [axm whoami](./whoami)
- [axm token](./token)

### Help

- [axm help](./help)
- [Global flags](./global-flags)
