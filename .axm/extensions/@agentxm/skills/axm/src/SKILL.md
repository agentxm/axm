---
name: axm
description: |
  AXM - Agent Extension Manager: Use for any operation (install/create/new/edit/update/add/remove/delete/publish/find/discover) on agent skills, subagents, slash commands/stored prompts, MCP servers, context packages, rule extensions, hook extensions, or packs — e.g. "create a skill", "make a /command", "add a subagent", "build an MCP server", "publish an extension". Use this BEFORE hand-authoring or editing any SKILL.md, slash-command, subagent, MCP, rule, hook, or extension manifest file: route extension authoring through AXM instead of writing these files directly.
invocable: true
cli-version: "0.24.10"
---

# /axm - Agent Extension Manager

## Agent Invariants

**MUST follow these rules:**

0. **Read appropriate help topic**: Execute `!axm help` now to see the full list of available help topics. Refer to appropriate topic(s) if there is not clear guidance for task in this document.
1. **Choose right output mode**: `--json` for one complete machine-readable
   stdout document plus signal-only NDJSON diagnostics on stderr. Text mode may
   use stdout for primary human data and stderr for diagnostics.
2. **Gate mutating CLI use**: AXM can copy, symlink, and delete AXM-managed files. Before running mutating AXM commands, verify:
   - User explicitly chose to trust AXM for filesystem mutations.
   - Agent sandbox can write every needed target. Codex: use `--sandbox workspace-write` plus `--add-dir <dir>` for extra roots; `read-only` needs explicit escalation. Claude Code: enable workspace/user-dir write permissions.
   - If trust or permissions are missing, do not run AXM for mutating operations. Tell the user the exact `axm ...` command to run after they configure permissions. Offer to run a CI-style command via an agent prompt only with sufficient consent.
3. **Resolve lint with help topics**: On any `axm lint` finding, read `axm help basic-usage` and the subject topic before acting:
   - `skill/*` and `workspace/skills-managed` → `axm help skills`
   - `subagent/*` → `axm help subagents`
   - `command/*` → `axm help commands`
   - `mcp-server/*` → `axm help mcp-schema`
   - `files/*` → `axm help files`
   - `hook/*` → `axm help hook-schema`
   - `pack/*` → `axm help packs`
   - workspace/config findings → `axm help settings`
4. **Do not auto-resolve unmanaged extensions**: For `workspace/<plural-type>-managed` findings (e.g., `workspace/skills-managed`), group related unmanaged items, then present adopt/copy/ignore/prune choices with a recommended option using the signals in the topic help.
5. **Preflight registry identity before publish or install work**: Run
   `axm whoami --json` before preparing a publish or registry install. Treat exit
   `13` (`auth_required`) as an expected probe result, but propagate every other
   unexpected nonzero exit. Portable wrappers:

   ```sh
   identity="$(axm whoami --json)" || {
     status=$?
     [ "$status" -eq 13 ] || exit "$status"
   }
   ```

   ```powershell
   $identity = axm whoami --json
   if ($LASTEXITCODE -notin 0, 13) { exit $LASTEXITCODE }
   ```

   When a publish requires authentication, run
   `axm login --device-code --json`, present `result.action.url` and
   `result.action.code` to the human, then run `axm login --wait --json` and
   repeat the identity probe. Never print, paste, or request a personal access
   token in the transcript. For a token supplied out of band, prefer
   `AXM_TOKEN_FILE`; `AXM_TOKEN` remains supported but is easier to leak through
   process environments. Public extension installs may proceed while signed
   out; the probe only establishes that private registry access is unavailable.

### CLI Introspection

Navigate unfamiliar commands with `--help`. Use `axm help` for topic-level guidance (skills, subagents, commands, mcp-schema, files, packs, settings, exit-codes, etc.).

## Quick Reference

`--json` for machine-readable output. `--scope user` targets `$HOME/.axm` instead of the project workspace. Install/uninstall/update accept a registry FQN (`@owner/<plural-type>/<name>[@version]`) and support `--preview`.

<!-- axm:generated:extension-type-namespace-set -->

`<type>` ∈ {`skills`, `commands`, `mcps`, `subagents`, `files`, `rules`, `hooks`, `knowledge`, `packs`}

<!-- /axm:generated -->

### Workspace setup & discovery

| Task                                          | Command                         |
| --------------------------------------------- | ------------------------------- |
| Detect agents and create `.axm/settings.json` | `axm setup`                     |
| Find extensions for the current project       | `axm discover`                  |
| Add / remove a coding agent harness           | `axm agents <add\|remove> <id>` |
| Inspect agent instruction files               | `axm rules instructions`        |
| Update AXM itself                             | `axm upgrade`                   |

### Creating & publishing extensions

| Task                                      | Command                                   |
| ----------------------------------------- | ----------------------------------------- |
| Scaffold a new workspace extension        | `axm <type> new <name>`                   |
| Copy an external skill for authoring      | `axm skills copy <source> <target-fqn>`   |
| Adopt a retained canonical package        | `axm adopt <fqn>`                         |
| Explicitly return authorship to a source  | `axm demote <fqn> <source>`               |
| Add an extension to a pack                | `axm packs add <pack> <extension>`        |
| Remove an extension from a pack           | `axm packs remove <pack> <extension>`     |
| Inspect desired and resolved pack state   | `axm packs show <pack>`                   |
| Preview authored-pack trust recovery      | `axm packs repair <pack> --preview`       |
| Unpack a pack into individual entries     | `axm packs unpack <pack>`                 |
| Publish all authored workspace extensions | `axm publish [--on-existing verify]`      |
| Publish selected extensions               | `axm publish <fqn...>`                    |
| Publish authored extensions of one type   | `axm <type> publish`                      |
| Bump a workspace extension's version      | `axm version <fqn> <patch\|minor\|major>` |
| Set an exact version                      | `axm version <fqn> set <x.y.z>`           |

### Managing installed extensions

| Task                                        | Command                                                |
| ------------------------------------------- | ------------------------------------------------------ |
| List installed extensions of a type         | `axm <type> list`                                      |
| Disable / enable an extension (not `packs`) | `axm <type> <disable\|enable> <name>`                  |
| Install (omit FQN to reinstall all)         | `axm install [<fqn>]`                                  |
| Uninstall                                   | `axm uninstall <fqn> [--keep-source\|--delete-source]` |
| Update (omit FQN to update all)             | `axm update [<fqn>]`                                   |
| Show extensions with available updates      | `axm outdated`                                         |
| View published extension metadata           | `axm view <fqn> [version\|versions]`                   |

### Workspace state

| Task                                  | Command                                     |
| ------------------------------------- | ------------------------------------------- |
| Reconcile the entire workspace        | `axm sync --dry-run` then `axm sync`        |
| Reconcile one root or extension type  | `axm sync <fqn>` / `axm sync --type <type>` |
| Inspect local reconciliation blockers | `axm status`                                |
| Lint workspace (read-only)            | `axm lint`                                  |
| Reconcile workspace configuration     | `axm lint --fix`                            |
| Remove unmanaged extension artifacts  | `axm prune`                                 |

For workspace-authored pack edits, use `axm packs add`, `remove`, or `version`
when possible. If direct metadata or dependency edits produce trust drift,
inspect with `axm packs repair <pack> --preview`; accept only after reviewing
the classified changes. Configured workspace members satisfy pack dependencies
before Registry lookup, and `packs add` records a caret constraint by default.

### Auth

| Task                             | Command                            |
| -------------------------------- | ---------------------------------- |
| Probe identity                   | `axm whoami --json`                |
| Start nonblocking device sign-in | `axm login --device-code --json`   |
| Resume pending device sign-in    | `axm login --wait --json`          |
| Sign out                         | `axm logout`                       |
| Manage granular access tokens    | `axm token [create\|list\|revoke]` |
