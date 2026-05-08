---
name: axm
description: |
  AXM - Agent Extension Manager: Use when performing any operation (install/create/new/edit/update/add/remove/delete/publish/find/discover/etc.) involving agent skills, subagents, and slash commands/stored prompts
invocable: true
---

# /axm - Agent Extension Manager Command

## Agent Invariants

**MUST follow these rules:**

1. **Choose right output mode**: `--json` for full JSON

### CLI Introspection

Navigate unfamiliar commands with `--help`.

## Getting Help

Get help on a topic `axm help [topic]` if you're unsure how to perform a task or encounter any issues you're not clear on how to resolve.

## Quick Reference

Append `--json` to any command for machine-readable output. Install/uninstall/update accept a registry FQN (`@owner/<plural-type>/<name>[@version]`);

| Task                                          | Command                                            |
| --------------------------------------------- | -------------------------------------------------- |
| Create a new skill                            | `axm skills new <name>`                            |
| Create a new subagent                         | `axm subagents new <name>`                         |
| Create a new command                          | `axm commands new <name>`                          |
| Create a new extension pack                   | `axm packs new <name>`                             |
| List installed skills                         | `axm skills list`                                  |
| List installed subagents                      | `axm subagents list`                               |
| List installed commands                       | `axm commands list`                                |
| Disable a skill / subagent / command          | `axm <kind> disable <name>`                        |
| Enable a skill / subagent / command           | `axm <kind> enable <name>`                         |
| Publish a skill / subagent / command / pack   | `axm <kind> publish <name>`                        |
| Bump a managed extension's version            | `axm <kind> version <name> <patch\|minor\|major>`  |
| Add an extension to a pack                    | `axm packs add <pack> <extension>`                 |
| Remove an extension from a pack               | `axm packs remove <pack> <extension>`              |
| Unpack a pack into individual entries         | `axm packs unpack <pack>`                          |
| Install an extension from the registry        | `axm install <fqn>`                                |
| Reinstall all configured extensions           | `axm install`                                      |
| Uninstall an extension                        | `axm uninstall <fqn>`                              |
| Update all extensions to latest               | `axm update`                                       |
| Update a single extension                     | `axm update <fqn>`                                 |
| Preview an install / uninstall / update       | `axm <install\|uninstall\|update> [fqn] --preview` |
| Materialize workspace files from the lockfile | `axm sync`                                         |
| Show extensions with available updates        | `axm outdated`                                     |
| View published extension metadata             | `axm view <fqn>`                                   |
| Reconcile workspace configuration             | `axm lint --fix`                                   |
