---
name: axm
description: |
  AXM - Agent Extension Manager: Use when performing any operation (install/create/new/edit/update/add/remove/delete/publish/find/discover/etc.) involving agent skills, subagents, slash commands/stored prompts, MCP servers, context packages, or packs
invocable: true
---

# /axm - Agent Extension Manager Command

## Agent Invariants

**MUST follow these rules:**

1. **Choose right output mode**: `--json` for full JSON.
2. **Gate mutating CLI use**: AXM can copy, symlink, and delete AXM-managed files. Before running mutating AXM commands, verify:
   - User explicitly chose to trust AXM for filesystem mutations.
   - Agent sandbox can write every needed target. Codex: use `--sandbox workspace-write` plus `--add-dir <dir>` for extra roots; `read-only` needs explicit escalation. Claude Code: enable workspace/user-dir write permissions.
   - If trust or permissions are missing, do not run AXM for mutating operations. Tell the user the exact `axm ...` command to run after they configure permissions. Offer to run a CI-style command via an agent prompt only with sufficient consent.
3. **Resolve lint with help topics**: On any `axm lint` finding, read `axm help basic-usage` and the subject topic before acting:
   - `skill/*` and `workspace/skills-managed` → `axm help skills`
   - `subagent/*` → `axm help subagents`
   - `command/*` → `axm help commands`
   - `mcp-server/*` → `axm help mcp-server-schema`
   - `context/*` → `axm help context`
   - `pack/*` → `axm help packs`
   - workspace/config findings → `axm help settings`
4. **Do not auto-resolve unmanaged extensions**: For `workspace/<plural-type>-managed` findings (e.g., `workspace/skills-managed`), group related unmanaged items, then present adopt/fork/ignore/prune choices with a recommended option using the signals in the topic help.

### CLI Introspection

Navigate unfamiliar commands with `--help`. Use `axm help` for topic-level guidance (skills, subagents, commands, mcp-server-schema, context, packs, settings, exit-codes, etc.).

## Quick Reference

`--json` for machine-readable output. `--scope user` targets `$HOME/.axm` instead of the project workspace. Install/uninstall/update accept a registry FQN (`@owner/<plural-type>/<name>[@version]`) and support `--preview`.

`<type>` ∈ {`skills`, `subagents`, `commands`, `mcp-servers`, `context`, `packs`}.

### Workspace setup & discovery

| Task                                          | Command                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| Detect agents and create `.axm/settings.json` | `axm setup`                                                              |
| Find extensions for the current project       | `axm discover`                                                           |
| Add / remove a coding agent harness           | `axm agents <add\|remove> <id>`                                          |
| Inspect / sync agent instruction files        | `axm agents instructions [status\|sync\|doctor\|adopt\|enable\|disable]` |
| Update AXM itself                             | `axm upgrade`                                                            |

### Creating & publishing extensions

| Task                                  | Command                                   |
| ------------------------------------- | ----------------------------------------- |
| Scaffold a new extension              | `axm <type> new <name>`                   |
| Add an extension to a pack            | `axm packs add <pack> <extension>`        |
| Remove an extension from a pack       | `axm packs remove <pack> <extension>`     |
| Unpack a pack into individual entries | `axm packs unpack <pack>`                 |
| Publish an extension                  | `axm <type> publish <name>`               |
| Bump a managed extension's version    | `axm version <fqn> <patch\|minor\|major>` |
| Set an exact version                  | `axm version <fqn> set <x.y.z>`           |

### Managing installed extensions

| Task                                   | Command                               |
| -------------------------------------- | ------------------------------------- |
| List installed extensions of a type    | `axm <type> list`                     |
| Disable / enable an extension          | `axm <type> <disable\|enable> <name>` |
| Install (omit FQN to reinstall all)    | `axm install [<fqn>]`                 |
| Uninstall                              | `axm uninstall <fqn>`                 |
| Update (omit FQN to update all)        | `axm update [<fqn>]`                  |
| Show extensions with available updates | `axm outdated`                        |
| View published extension metadata      | `axm view <fqn> [version\|versions]`  |

### Workspace state

| Task                                          | Command          |
| --------------------------------------------- | ---------------- |
| Materialize workspace files from the lockfile | `axm sync`       |
| Lint workspace (read-only)                    | `axm lint`       |
| Reconcile workspace configuration             | `axm lint --fix` |
| Remove unmanaged extension artifacts          | `axm prune`      |

### Curated lists & auth

| Task                                    | Command                                                       |
| --------------------------------------- | ------------------------------------------------------------- |
| Browse / manage curated extension lists | `axm lists <list\|view\|create\|update\|delete\|add\|remove>` |
| Sign in / out / identity                | `axm <login\|logout\|whoami>`                                 |
| Manage granular access tokens           | `axm token [create\|list\|revoke]`                            |
