---
name: axm
description: |
  AXM - Agent Extension Manager: Use for any operation (install/create/new/edit/update/add/remove/delete/publish/find/discover) on agent skills, subagents, MCP servers, rules, hooks, knowledge bundles, or packs — e.g. "create a skill", "add a subagent", "build an MCP server", or "publish an extension". Use this before hand-authoring or editing any SKILL.md, subagent, MCP, rule, hook, knowledge, or extension manifest file: route extension authoring through AXM instead of writing these files directly.
metadata:
  agentxm.ai/cli-version: "0.26.2"
---

# /axm - Agent Extension Manager

## Agent Invariants

**MUST follow these rules:**

0. **Read appropriate help topic**: Execute `!axm help` now to see the full list of available help topics. Refer to appropriate topic(s) if there is not clear guidance for task in this document.
1. **Choose right output mode**: `--json` for one complete machine-readable
   stdout document plus signal-only NDJSON diagnostics on stderr. Text mode may
   use stdout for primary human data and stderr for diagnostics. Treat an
   ordinary stdout document as compatible only when it owns `result`, or when
   it is the fixed `ok: false` error envelope; `type: help|version` documents
   are formatter-owned exceptions. Do not infer this contract from 0.24.x
   version text because that release line contains both legacy and current
   shapes.
2. **Gate mutating CLI use**: AXM can copy, symlink, and delete AXM-managed files. Before running mutating AXM commands, verify:
   - User explicitly chose to trust AXM for filesystem mutations.
   - Agent sandbox can write every needed target. Codex: use `--sandbox workspace-write` plus `--add-dir <dir>` for extra roots; `read-only` needs explicit escalation. Claude Code: enable workspace/user-dir write permissions.
   - If trust or permissions are missing, do not run AXM for mutating operations. Tell the user the exact `axm ...` command to run after they configure permissions. Offer to run a CI-style command via an agent prompt only with sufficient consent.
   - Once the user has requested an eligible mutation, run it directly. `--yes`
     only preapproves a confirmable semantic risk; it is not a generic mutation
     gate. Named policy flags such as `--break-dependencies` and
     `--ignore-version-constraints` remain separate and cannot be replaced by
     `--yes`. Use `--preview` for a no-write candidate and `--non-interactive`
     when automation must fail deterministically instead of prompting.
3. **Resolve lint with help topics**: On any `axm lint` finding, read `axm help basic-usage` and the subject topic before acting:
   - `skill/*` and `workspace/skills-managed` → `axm help skills`
   - `subagent/*` → `axm help subagents`
   - `mcp-server/*` → `axm help mcp-schema`
   - `hook/*` → `axm help hook-schema`
   - `pack/*` → `axm help packs`
   - workspace/config findings → `axm help settings`
4. **Do not auto-resolve unmanaged extensions**: For `workspace/<plural-type>-managed` findings (e.g., `workspace/skills-managed`), group related unmanaged items, then present adopt/copy/leave-unowned/prune choices with a recommended option using the signals in the topic help.
5. **Review Git hooks before editing**: For Git-hook setup, read `axm help
git-hooks`, inspect the existing hook manager and CI gate, and propose the
   exact diff plus strictness, formatter order, missing-AXM, and bypass policies.
   Get consent before editing shared hook files with normal tools. Preserve
   existing checks, stage only the intended changes, then run `axm lint
--view git-index` with the chosen strictness.
6. **Preflight registry identity before publish or install work**: Run
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

7. **Keep extensions self-contained**: When authoring a non-pack extension, do
   not require or invoke another extension, reference its files or capabilities,
   or assume it is installed. Remove the dependency or keep required material
   inside the extension. Only couple direct sibling members of one pack; set the
   referencing extension to `standalone: false`, name the shared pack in
   `recommendedPacks`, and follow `axm help packs`. A recommendation alone does
   not install the pack or its members.

### CLI Introspection

Navigate unfamiliar commands with `--help`. Use `axm help` for topic-level guidance (skills, subagents, mcp-schema, rules, hooks, knowledge, packs, settings, exit-codes, etc.).

## Quick Reference

`--json` requests machine-readable output. On installed-state commands,
`--scope user` targets `$HOME/.axm` instead of the project workspace;
suggestions and artifacts retain that selection. Authoring commands (`new`,
skill copy, adopt, demote, version, pack authoring, and publish) are
project-workspace only and reject `--scope`. Install/uninstall/update accept a
registry FQN (`@owner/<plural-type>/<name>[@version]`) and support `--preview`.

<!-- axm:generated:extension-type-namespace-set -->

`<type>` ∈ {`skills`, `mcps`, `subagents`, `rules`, `hooks`, `knowledge`, `packs`}

<!-- /axm:generated -->

Knowledge bundles stay canonical under `.axm/extensions`; active bundles are
listed in the managed `Knowledge Base` table in the canonical instruction file.
Use `knowledgeConfig.instructions: false` only to suppress that table. It does
not disable install, trust, search, or open behavior; use `axm knowledge disable`
to retain a bundle without active discovery.
Read `axm help knowledge` before authoring or revising a Knowledge bundle.

### Workspace setup & discovery

`axm setup` only initializes a scope that has no settings. After initialization,
change coding-agent membership with `axm agents add <id>` or `axm agents remove
<id>` so membership and every owned per-agent artifact change atomically.
Rerunning setup, including with different `--agent` flags, is a no-op.

| Task                                          | Command                         |
| --------------------------------------------- | ------------------------------- |
| Detect agents and create `.axm/settings.json` | `axm setup`                     |
| Find extensions for the current project       | `axm discover`                  |
| Add / remove a coding agent harness           | `axm agents <add\|remove> <id>` |
| Inspect agent instruction files               | `axm rules instructions`        |
| Update AXM itself                             | `axm upgrade`                   |

Rule activation always requires an installed rule name: use `axm rules enable
<name>` or `axm rules disable <name>`. Global instruction-file ownership is a
separate capability under `axm rules instructions enable|disable|status`.
These transitions reconcile the canonical Rules region, every configured alias,
and the managed `.gitignore` block atomically; resolve reported drift through
the reviewable `axm lint --fix` plan.

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
| Publish all authored workspace extensions | `axm publish --yes`                       |
| Publish selected extensions               | `axm publish <fqn...> --yes`              |
| Publish authored extensions of one type   | `axm <type> publish --yes`                |
| Bump a workspace extension's version      | `axm version <fqn> <patch\|minor\|major>` |
| Set an exact version                      | `axm version <fqn> set <x.y.z>`           |

Publish preflights the complete selection before any upload. Bare and
filter-only bulk selections verify and skip byte-identical published versions;
integrity drift blocks every upload. Explicit selectors remain strict unless
`--on-existing verify` is supplied, while `--on-existing error` makes a bulk
selection strict. Use `--backfill` only for an unpublished lower SemVer. Unsafe
archives cannot be bypassed, and `--include-dependencies` /
`--include-dependency` are pack-only flags.

### Managing installed extensions

| Task                                        | Command                               |
| ------------------------------------------- | ------------------------------------- |
| List installed extensions of a type         | `axm <type> list`                     |
| List all local extension state              | `axm list`                            |
| Disable / enable an extension (not `packs`) | `axm <type> <disable\|enable> <name>` |
| Install (omit FQN to reinstall all)         | `axm install [<fqn>]`                 |
| Uninstall                                   | `axm uninstall <fqn>`                 |
| Update (omit FQN to update all)             | `axm update [<fqn>]`                  |
| Show extensions with available updates      | `axm list --outdated`                 |
| Show deprecated installed extensions        | `axm list --deprecated`               |
| View published extension metadata           | `axm view <fqn> [version\|versions]`  |

### Workspace state

| Task                                  | Command                                     |
| ------------------------------------- | ------------------------------------------- |
| Reconcile the entire workspace        | `axm sync --preview` then `axm sync`        |
| Reconcile one root or extension type  | `axm sync <fqn>` / `axm sync --type <type>` |
| Inspect local reconciliation blockers | `axm status`                                |
| Lint workspace (read-only)            | `axm lint`                                  |
| Lint the exact Git index              | `axm lint --view git-index`                 |
| Reconcile workspace configuration     | `axm lint --fix`                            |
| Preview one inline MCP drift repair   | `axm mcps repair <name> --preview`          |
| Remove unmanaged extension artifacts  | `axm prune`                                 |

For workspace-authored pack edits, use `axm packs add`, `remove`, or `version`
when possible. If direct metadata or dependency edits produce trust drift,
inspect with `axm packs repair <pack> --preview`; accept only after reviewing
the classified changes. Configured workspace members satisfy pack dependencies
before Registry lookup, and `packs add` records a caret constraint by default.

Pack install, update, enable/disable, uninstall, and unpack operate on one pack
and its complete member graph atomically. Use `--preview` to inspect the exact
canonical sources created, updated, or removed. A failed member or unmet
postcondition rolls back the whole graph. Unpack promotes member provenance to
direct settings before removing the pack; no bypass flag is required or
supported. Reinstall options never accept authored-pack trust drift—use the
explicit `packs repair` review flow.

Use disable when an installed extension should remain managed but inactive.
Uninstall removes canonical source and managed artifacts once no declaration or
pack still reaches them.

Treat `.axm/settings.json` as desired state, `.axm/trust.json` as source trust,
and `.axm/axm-lock.yaml` as receipt history. Never hand-rewrite trust or receipt
hashes to reconstruct a missing declaration. When `axm status` or `axm lint`
reports a receipt-only skill, use the exact reported `axm skills install
<source> --yes` command to declare and retain it, or explicitly run `axm skills
uninstall <name>`. Do not use `axm lint --fix` to choose between those outcomes.

### Auth

| Task                             | Command                            |
| -------------------------------- | ---------------------------------- |
| Probe identity                   | `axm whoami --json`                |
| Start nonblocking device sign-in | `axm login --device-code --json`   |
| Resume pending device sign-in    | `axm login --wait --json`          |
| Sign out                         | `axm logout`                       |
| Manage granular access tokens    | `axm token [create\|list\|revoke]` |
