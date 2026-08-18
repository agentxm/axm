---
name: axm
description: |
  AXM - Agent Extension Manager: Use for any operation (install/create/new/edit/update/add/remove/delete/publish/find/discover) on agent skills, subagents, MCP servers, rules, hooks, knowledge bundles, or packs — e.g. "create a skill", "add a subagent", "build an MCP server", or "publish an extension". Use this before hand-authoring or editing any SKILL.md, subagent, MCP, rule, hook, knowledge, or extension manifest file: route extension authoring through AXM instead of writing these files directly.
metadata:
  axm.sh/cli-version: "0.27.9"
  axm.sh/cli-version-range: "0.27.9"
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
   are formatter-owned exceptions.
2. **Gate mutating CLI use**: AXM can copy, symlink, and delete AXM-managed files. Before running mutating AXM commands, verify:
   - User explicitly chose to trust AXM for filesystem mutations.
   - Agent sandbox can write every needed target. Codex: use `--sandbox workspace-write` plus `--add-dir <dir>` for extra roots; `read-only` needs explicit escalation. Claude Code: enable workspace/user-dir write permissions.
   - If trust or permissions are missing, do not run AXM for mutating operations. Tell the user the exact `axm ...` command to run after they configure permissions. Offer to run a CI-style command via an agent prompt only with sufficient consent.
   - Once the user has requested an eligible mutation, run it directly. `--yes`
     only preapproves a confirmable semantic risk; it is not a generic mutation
     gate. Named policy flags such as `--ignore-version-constraints` remain
     separate and cannot be replaced by
     `--yes`. Use `--preview` for a no-write candidate and `--non-interactive`
     when automation must fail deterministically instead of prompting.
3. **Resolve lint with help topics**: On any `axm lint` finding, read `axm help basic-usage` and the subject topic before acting:
   - `skill/*` → `axm help skills`
   - `subagent/*` → `axm help subagents`
   - `mcp-server/*` → `axm help mcp-schema`
   - `hook/*` → `axm help hook-schema`
   - `pack/*` → `axm help packs`
   - `workspace/axm-skill-compatible` → `axm help upgrade` and
     "CLI & skill compatibility" below
   - workspace/config findings → `axm help settings`
4. **Review Git hooks before editing**: For Git-hook setup, read `axm help
git-hooks`, inspect the existing hook manager and CI gate, and propose the
   exact diff plus strictness, formatter order, missing-AXM, and bypass policies.
   Get consent before editing shared hook files with normal tools. Preserve
   existing checks, stage only the intended changes, then run `axm lint
--view git-index` with the chosen strictness.
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

6. **Keep extensions self-contained**: When authoring a non-pack extension, do
   not require or invoke another extension, reference its files or capabilities,
   or assume it is installed. Remove the dependency or keep required material
   inside the extension. Only couple direct sibling members of one pack; set the
   referencing extension to `standalone: false`, name the shared pack in
   `recommendedPacks`, and follow `axm help packs`. A recommendation alone does
   not install the pack or its members.
7. **Treat Registry retries as bounded recovery**: AXM times out each Registry
   attempt and the complete operation. It may retry replay-safe reads, honoring
   server retry guidance only within the total deadline, but it does not retry
   mutations without a Registry-supported idempotency key. In automation,
   handle the one final nonzero result by its stable error code and diagnostics;
   do not add an outer mutation retry loop. Cancellation remains immediate.

### CLI Introspection

Navigate unfamiliar commands with `--help`. Use `axm help` for topic-level guidance (skills, subagents, mcp-schema, rules, hooks, knowledge, packs, settings, exit-codes, etc.).

## Quick Reference

`--json` requests machine-readable output. On installed-state commands,
`--scope user` targets `$HOME/.axm` instead of the project workspace;
suggestions and artifacts retain that selection. Authoring commands (`new`,
import, adopt, demote, version, pack authoring, and publish) are
project-workspace only and reject `--scope`. Install/uninstall/update accept a
registry FQN (`@owner/<plural-type>/<name>[@version]`) and support `--preview`.

<!-- axm:generated:extension-type-namespace-set -->

`<type>` ∈ {`skills`, `mcps`, `subagents`, `rules`, `hooks`, `knowledge`, `packs`}

<!-- /axm:generated -->

Knowledge bundles stay canonical under `.axm/extensions`; active bundles are
listed in the managed `Knowledge Base` table in the canonical instruction file.
Use `knowledgeConfig.instructions: false` only to suppress that table. It does
not disable install, accepted resolution, search, or open behavior; use `axm knowledge disable`
to retain a bundle without active discovery.
Read `axm help knowledge` before authoring or revising a Knowledge bundle.

### Workspace setup & discovery

`axm setup` only initializes a scope that has no settings. After initialization,
change coding-agent membership with `axm agents add <id>` or `axm agents remove
<id>` so membership and every owned per-agent artifact change atomically.
Rerunning setup, including with different `--agent` flags, is a no-op.

Interactive setup distinguishes project evidence from workstation-only
availability, previews one exact agent and file candidate, and confirms before
writing. Project evidence is strong project-scope intent; workstation-only
agents remain visible but are not preselected for project setup. With no
detection, setup offers a small catalog-driven starter set for review.

For unattended first setup, run `axm setup --preview --scope project --json
--non-interactive`, review `result.agents`, `result.agentCandidates`, and
`result.scopeSupport`, and `result.steps`, then obtain approval for that exact
candidate. Apply it with `axm setup --yes --scope project --agent <id>...
--non-interactive`, repeating `--agent` for every approved ID. Omitting
approval, explicit scope, or explicit agents returns `reason:
"approval-required"` without writes.

`result.scopeSupport` is the effective category contract for the chosen agents
and scope. Its outcomes are `supported`, `project-only`, `unsupported`, or
`refused`, with stable `reasonCode` values. Per-agent categories report each
agent separately; rules also report instruction-file projection, while
knowledge and packs report workspace/container support. Never reinterpret a
`project-only` or `refused` user-scope outcome as permission to write the
project scope. Keep `--scope user` on follow-up `agents list`, `sync --preview`,
`lint`, and `list` commands; discovery and Git-hook setup are project-only.

| Task                                    | Command                                                        |
| --------------------------------------- | -------------------------------------------------------------- |
| Interactively preview and initialize    | `axm setup`                                                    |
| Preview unattended setup without writes | `axm setup --preview --scope project --json --non-interactive` |
| Find extensions for the current project | `axm discover`                                                 |
| Add / remove a coding agent harness     | `axm agents <add\|remove> <id>`                                |
| Inspect agent instruction files         | `axm rules instructions`                                       |
| Update AXM itself                       | `axm upgrade`                                                  |

Rule activation always requires an installed rule name: use `axm rules enable
<name>` or `axm rules disable <name>`. Global instruction-file ownership is a
separate capability under `axm rules instructions enable|disable|status`.
These transitions reconcile the canonical Rules region, every configured alias,
and the managed `.gitignore` block atomically; preview reported drift with
`axm sync --preview`, then reconcile it with `axm sync`.

### CLI & skill compatibility

This skill's frontmatter declares the CLI releases it supports
(`axm.sh/cli-version-range`). When the running CLI falls outside that range,
`axm lint` reports `workspace/axm-skill-compatible` as an error and strict lint
exits 1. Never resolve a mismatch by editing that metadata, the skill version,
or the generated bundled-skill module; release tooling owns the CLI and skill
as one fixed pair. Realign whichever side is behind, honoring the mutation gate
in invariant 2:

| Situation                                | Command                                            |
| ---------------------------------------- | -------------------------------------------------- |
| CLI older than the skill                 | `axm upgrade`                                      |
| Skill stale for a newer CLI              | `axm skills update @agentxm/skills/axm`            |
| No compatible published release resolves | `axm skills install @agentxm/skills/axm --bundled` |

`--bundled` replaces the canonical source at
`.axm/extensions/@agentxm/skills/axm` with the copy embedded in the running
CLI. Preview it first, and do not run it in a workspace that authors this
skill, where it would overwrite in-flight authoring; upgrade the CLI there
instead. Read `axm help upgrade` before acting on a refused or incomplete
upgrade.

### Creating & publishing extensions

| Task                                      | Command                                   |
| ----------------------------------------- | ----------------------------------------- |
| Scaffold a new workspace extension        | `axm <type> new <name>`                   |
| Adopt a retained canonical package        | `axm adopt <fqn>`                         |
| Explicitly return authorship to a source  | `axm demote <fqn> <source>`               |
| Add an extension to a pack                | `axm packs add <pack> <extension>`        |
| Remove an extension from a pack           | `axm packs remove <pack> <extension>`     |
| Inspect desired Pack state                | `axm packs show <pack>`                   |
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

| Task                                 | Command                                      |
| ------------------------------------ | -------------------------------------------- |
| Reconcile the entire workspace       | `axm sync --preview` then `axm sync`         |
| Assert convergence in CI             | `axm sync --preview --fail-on-change --json` |
| Reconcile one root or extension type | `axm sync <fqn>` / `axm sync --type <type>`  |
| Lint workspace (read-only)           | `axm lint`                                   |
| Lint the exact Git index             | `axm lint --view git-index`                  |

Ordinary sync may apply directly because it realizes intent already accepted
in settings, authored Pack manifests, and the lockfile; it does not create or
revise extension intent. Use preview when a person needs to inspect the exact
candidate. In automation, add `--fail-on-change`: exit 1 and the
`reconciliation-required` result mean ordinary sync would change managed state,
while exit 0 means the workspace is converged. The assertion never writes.

For workspace-authored pack edits, use `axm packs add`, `remove`, or `version`
when possible. The authored manifest is desired authority immediately; use
`axm sync --preview` to review the resulting reconciliation. Configured
workspace members satisfy pack dependencies before Registry lookup, and
`packs add` records a `>=` lower bound by default so members track their latest
release. Narrow a range by hand only to exclude a known-breaking member release.

Pack install, update, enable/disable, uninstall, and unpack operate on one pack
and its complete member graph atomically. Use `--preview` to inspect the exact
canonical sources created, updated, or removed. A failed member or unmet
postcondition rolls back the whole graph. Unpack promotes member provenance to
direct settings before removing the pack; no bypass flag is required or
supported.

Use disable when an installed extension should remain managed but inactive.
Uninstall removes canonical source and managed artifacts once no declaration or
pack still reaches them.

Treat `.axm/settings.json` and workspace-authored pack manifests as desired
state. `.axm/axm-lock.yaml` is accepted immutable external resolution, not
desired intent or command history. Never reconstruct declarations from lock
rows or observed files. Use `axm lint` for facts and `axm sync` for
reconciliation.

### Auth

| Task                             | Command                            |
| -------------------------------- | ---------------------------------- |
| Probe identity                   | `axm whoami --json`                |
| Start nonblocking device sign-in | `axm login --device-code --json`   |
| Resume pending device sign-in    | `axm login --wait --json`          |
| Sign out                         | `axm logout`                       |
| Manage granular access tokens    | `axm token [create\|list\|revoke]` |
