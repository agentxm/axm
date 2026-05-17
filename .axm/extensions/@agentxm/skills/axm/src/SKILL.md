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
2. **Gate mutating CLI use**: AXM can copy, symlink, and delete AXM-managed files. Before running mutating AXM commands, verify:
   - User explicitly chose to trust AXM for filesystem mutations.
   - Agent sandbox can write every needed target. Codex: use `--sandbox workspace-write` plus `--add-dir <dir>` for extra roots; `read-only` needs explicit escalation. Claude Code: enable workspace/user-dir write permissions.
   - If trust or permissions are missing, do not run AXM for mutating operations. Tell the user the exact `axm ...` command to run after they configure permissions. Offer option to run CI command via agent prompt if you have the ability to do so with sufficient consent from the user.
3. **Resolve lint with help topics**: On any `axm lint` finding, read `axm help basic-usage` and the subject topic before acting: `axm help skills` for `skill/*` and `workspace/skills-managed`, `axm help packs` for `pack/*`, and `axm help settings` for workspace/config findings.
4. **Do not auto-resolve unmanaged skills**: For `workspace/skills-managed`, group related unmanaged skills, then present adopt/fork/ignore/prune choices with a recommended option using the signals in `axm help skills`.

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
| List configured and detected coding agents    | `axm agents list`                                  |
| Add / remove a coding agent harness           | `axm agents <add\|remove> <id>`                    |
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
