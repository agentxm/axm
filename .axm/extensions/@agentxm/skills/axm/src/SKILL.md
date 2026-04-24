---
name: axm
description: |
  Manage AI agent extensions via the axm CLI. Set up workspaces, install,
  update, publish, and manage skills, commands, MCP servers, extension packs,
  and other extension types. Use for any axm or AgentXM question or action.
cli-version-audited: "0.4.5"
triggers:
  # Direct invocations
  - axm
  - /axm
  # Workspace lifecycle
  - axm setup
  - axm install
  - axm update
  - axm uninstall
  - axm outdated
  - axm prune
  # Domain commands
  - axm skills
  - axm packs
  - axm commands
  - axm mcp-servers
  - axm subagents
  - axm auth
  - axm login
  - axm logout
  - axm whoami
  - axm token
  - axm upgrade
  # Workspace ops
  - axm lint
  - axm discover
  # Common intents
  - set up workspace
  - install extension
  - install skill
  - install pack
  - install command
  - install mcp server
  - install subagent
  - uninstall extension
  - publish extension
  - manage extensions
  - update extensions
  - outdated extensions
  - prune unmanaged extensions
  - discover extensions
  - check workspace
  - check auth
  # Questions
  - how do I axm
  - what extensions
  - does axm
invocable: true
argument-hint: "[action] [args...]"
---

# axm

CLI reference for the axm extension manager (v0.4.5).

## Agent Invariants

1. **JSON output.** Use `--json` for data commands and when you need parseable
   mutation output. Help output is text-only.
2. **Non-interactive.** Use `--yes` for plan confirmations. Use
   `--non-interactive` to disable prompts, but do not assume it implies
   `--yes`.
3. **Scope awareness.** Project scope (`.axm/`) is default. User scope resolves
   to `$AXM_USER_HOME/.axm` or `$HOME/.axm`.
4. **Preview before mutation.** Use `--preview` before install, update,
   uninstall, publish, prune, unpack, or any `--force` action.
5. **Exit codes matter.** `0` = success or clean user cancellation. `1` =
   expected command failure. `2` = unexpected defect. JSON errors usually
   include `code`, `message`, and `exitCode`.
6. **Probe commands.** In agent sessions, wrap expected signed-out probes so
   the shell still exits `0`.
7. **No search command.** No `axm search` yet. Use `axm discover --json`,
   installed lists, or registry browsing.
8. **Initial failure choices.** Make a reasonable first attempt. If that first
   attempt fails and there is more than one reasonable next step, prompt the
   user with concise options instead of an open-ended question:
   `Recommended` first (based on inferred user intent), then up to two
   reasonable alternatives, then `Do nothing`.

## Output Modes

| Goal                | Flag              | Notes                                   |
| ------------------- | ----------------- | --------------------------------------- |
| Structured data     | `--json` / `-j`   | Final machine-readable result on stdout |
| Minimal output      | `--quiet` / `-q`  | Suppress non-essential human output     |
| Verbose diagnostics | `--verbose` / `-v` | Extra error context                    |
| Full debug          | `--debug`         | Full debug details; implies verbose     |

## CLI Introspection

Use live help output to verify the current command tree and flags:

```bash
axm --help
axm setup --help
axm skills install --help
axm packs publish --help
```

Help output is text-only; there is no JSON help schema. When unsure, inspect
help first, then rerun the real command with `--json` if that command supports
machine output.

## Smart Defaults

- Prefer top-level workspace commands (`setup`, `install`, `update`,
  `uninstall`, `outdated`, `prune`) when you already have a registry FQN or
  want to act on all configured extensions.
- Use type-specific commands for GitHub/local/URL sources
  (`skills install owner/repo`, `subagents install ./path`) and for
  scaffolding or publishing.
- Be explicit in agent sessions: add `--json`, `--yes`, `--preview`, and
  `--non-interactive` instead of relying on TTY heuristics.
- Non-interactive auth uses `AXM_TOKEN`. Registry overrides use
  `AXM_REGISTRY_URL` and `AXM_REGISTRY_LOCATION`. `AXM_USER_HOME` overrides the
  user workspace root. `AXM_TELEMETRY=0` disables telemetry.

## Probe Commands

When checking sign-in state in an agent session, branch on stdout, not exit
code:

```bash
axm auth whoami --json 2>/dev/null || echo '{"type":"error","code":"AUTH_LOGIN_REQUIRED"}'
```

## Quick Reference

| Task                              | Command                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Set up workspace                  | `axm setup --yes`                                                                           |
| Discover compatible extensions    | `axm discover --json`                                                                       |
| Install registry extension by FQN | `axm install @profile/skills/name --yes`                                                    |
| Install skill from GitHub         | `axm skills install owner/repo --yes`                                                       |
| Install all skills from source    | `axm skills install owner/repo --all --yes`                                                 |
| Install subagent from local path  | `axm subagents install ./path/to/subagents --yes`                                           |
| Install extension pack            | `axm packs install @profile/packs/name --yes`                                               |
| List installed skills             | `axm skills list --json`                                                                    |
| Check available updates           | `axm outdated --json`                                                                       |
| Update configured extensions      | `axm update --yes`                                                                          |
| Update specific skill             | `axm skills update --skill name --yes`                                                      |
| Preview uninstall by FQN          | `axm uninstall @profile/skills/name --preview`                                              |
| Preview unmanaged cleanup         | `axm prune --json`                                                                          |
| Lint workspace                    | `axm lint --json`                                                                           |
| Lint + autofix                    | `axm lint --fix`                                                                            |
| Check auth status (probe)         | See `Probe Commands` above                                                                  |
| Sign in / out                     | `axm auth login --yes` / `axm auth logout`                                                  |
| Create a new skill                | `axm skills new name --yes`                                                                 |
| Publish a skill                   | `axm skills publish name --preview`                                                         |
| Upgrade axm                       | `axm upgrade`                                                                               |

## Decision Trees

```text
Setting up a workspace?
├── No .axm/? → axm setup --yes
│   ├── Need registry suggestions from project deps → axm discover --json
│   ├── Know exact registry FQN → axm install @profile/<type>/name --yes
│   ├── Have GitHub/local multi-skill or multi-subagent source
│   │   ├── Skills → axm skills install owner/repo --yes
│   │   └── Subagents → axm subagents install ./path --yes
│   ├── Has existing skills on disk → axm skills list --json (check Unmanaged)
│   │   ├── Adopt → axm skills install <source> --yes
│   │   ├── Customize → axm skills fork <name> --yes
│   │   └── Hide → Add to ignored patterns in settings
│   └── Tool-managed skills → Leave as Unmanaged, do not modify
└── Already has .axm/
    ├── Review current state → axm skills list --json
    └── Check updates → axm outdated --json

Triaging a workspace?
├── Check findings → axm lint --json (findings[] with rule id + severity)
├── Reconcile drift / apply autofixes → axm lint --fix
├── Check available updates → axm outdated --json
└── Review unmanaged cleanup → axm prune --json → axm prune --yes

Want to find/install an extension?
├── Know the registry FQN → axm install @profile/<plural-type>/name --yes
├── Have a GitHub/local/URL source for skills or subagents
│   ├── Skills → axm skills install owner/repo --yes
│   └── Subagents → axm subagents install ./path --yes
├── Need suggestions from project deps → axm discover --json
└── Need installed inventory → axm skills list --json / axm commands list --json

Want to publish?
├── New skill → axm skills new name → edit src/SKILL.md → axm skills publish name --preview
├── New subagent → axm subagents new name → edit → axm subagents publish name --preview
├── New command → axm commands new name → edit → axm commands publish name --preview
├── New extension pack → axm packs new name → axm packs add → axm packs publish name --preview
└── Include pack dependencies → axm packs publish name --include-dependencies --preview
```

## Common Workflows

### Check Sign-In State Safely

```bash
axm auth whoami --json 2>/dev/null || echo '{"type":"error","code":"AUTH_LOGIN_REQUIRED"}'
```

### Set Up a New Project

```bash
axm setup --yes
axm discover --json
axm install @acme/skills/code-review --yes
axm outdated --json
```

### Update Configured Extensions

```bash
axm update --preview
axm update --yes
axm outdated --json
```

### Publish a New Skill

```bash
axm skills new my-skill --yes
# Edit .axm/extensions/@<profile>/skills/my-skill/src/SKILL.md
axm skills publish my-skill --preview
axm skills publish my-skill --yes
```

### Fork and Customize

```bash
axm skills fork code-review --yes
# Rename with a descriptive name (not "code-review-fork")
axm skills rename code-review team-code-review --yes
```

### Migrate Claude Code Plugins to axm

```bash
# 1. Audit: scan .claude/settings.json, .claude/skills/, .claude/commands/
axm setup --yes

# 2. For skills with registry equivalents:
axm install @profile/skills/equivalent --yes

# 3. For unique skills, create new:
axm skills new my-skill --yes
# Copy SKILL.md content from .claude/skills/<name>/

# 4. Optionally bundle into a pack:
axm packs new my-toolkit --yes
axm packs add my-toolkit my-skill --yes
axm packs publish my-toolkit -d --yes
```

### Adopt Unmanaged Skills After Setup

```bash
axm skills list --json                              # Identify Unmanaged
axm skills install owner/repo --skill name --yes    # Adopt
axm skills fork name --yes                          # Or customize
axm skills list --json                              # Verify
```

## Workspace Setup Scenarios

### Greenfield (no agent tooling)

`axm setup --yes` creates `.axm/settings.json`, `axm-lock.yaml`, installs
default extensions. All extensions are **Configured**. Install skills for your
use case.

### Greenfield with Agent Config

Has `.claude/` but no extensions. `axm setup` layers alongside — no conflicts.
Project `.axm/` overrides user `$AXM_USER_HOME/.axm` or `$HOME/.axm`.

### Brownfield with Unmanaged Skills

Has skills on disk not managed by axm. After `axm setup`, detected as
**Unmanaged**. For each, decide:

- **Adopt:** `axm skills install <source> --yes` (Configured with tracking)
- **Fork:** `axm skills fork <name> --yes` (editable local copy)
- **Ignore:** Add to ignored patterns in settings
- **Leave:** Unmanaged skills still function

Fork naming: prefer `team-code-review` over `code-review-fork`.

### Brownfield with Tool-Managed Skills

Do not modify tool-managed skills via axm without user confirmation. Coexistence
is the default.

### Brownfield with Script-Managed Skills

Source of truth is the remote repo. Transition:
`axm skills install owner/repo --skill name --yes`. Decide track vs fork. Retire
old script after `axm skills list --json` confirms all expected skills.

### Already Using axm

`axm setup` is idempotent. Review with `axm skills list --json` and
`axm outdated --json`.

## Command Reference

Global flags: `--json`, `--quiet`, `--verbose`, `--debug`, `--non-interactive`,
`--help`, `--version`. Standard mutation flags on most commands: `--yes`,
`--force`, `--preview`, `--scope <project|user>`.

Top-level command groups: `setup`, `discover`, `install`, `update`,
`uninstall`, `outdated`, `lint`, `prune`, `upgrade`, `skills`, `packs`,
`commands`, `mcp-servers`, `subagents`, `auth`, `login`, `logout`, `whoami`,
`token`. The auth shortcut commands (`login`, `logout`, `whoami`, `token`) are
aliases for the corresponding `auth <sub>` forms.

### setup

```
axm setup [--scope project|user] [--agent <id>...] [--yes] [--force] [--preview]
```

Creates `.axm/settings.json` and `axm-lock.yaml`, detects installed agents, and
installs default extensions. Idempotent. Use `--agent` to skip auto-detection.
With `--non-interactive` and no `--agent`, axm auto-selects all detected
agents.

### install

```
axm install [--scope project|user] [--yes] [--force] [--preview] [<source>]
```

Without `<source>`, installs all configured extensions in the current scope.
With `<source>`, expects a registry FQN such as `@owner/skills/name[@version]`.

### update

```
axm update [--scope project|user] [--yes] [--force] [--preview] [<source>]
```

Without `<source>`, updates all configured extensions in the current scope.
With `<source>`, targets one registry FQN.

### uninstall

```
axm uninstall [--yes] [--force] [--preview] <source>
```

Removes an installed extension by registry FQN. **Destructive.** Use
`--preview` first.

### outdated

```
axm outdated [--scope project|user] [--type skill|command|mcp-server|subagent|pack] [--json]
```

Read-only inventory of available updates. Use `--type` to focus one extension
kind.

### prune

```
axm prune [--scope project|user] [--yes] [<patterns...>]
```

Read-only by default. With `--yes`, removes unmanaged artifacts matching the
optional glob patterns. `--json` works in both preview and apply modes.

### skills install

```
axm skills install [flags] [<source>]
```

Source formats: `@profile/skills/name[@version]` (registry), `owner/repo`
(GitHub), `./path` (local), or URL. Without `<source>`, installs configured
skills.

| Flag      | Description                               |
| --------- | ----------------------------------------- |
| `--skill` | Cherry-pick specific skill(s) from source |
| `--all`   | Install every skill from source           |
| `--scope` | `project` (default) or `user`             |

```bash
axm skills install @acme/skills/code-review@^1.0.0 --yes
axm skills install owner/repo --all --yes
axm skills install ./path --skill "effect-*" --yes
```

### skills uninstall

```
axm skills uninstall <skill> [--yes] [--force] [--preview]
```

**Destructive.** Use `--preview` first. `--force` removes even with dependents.

### skills list

```
axm skills list [--scope project|user] [--agent <id>] [--json]
```

Alias: `axm skills ls`

### skills update

```
axm skills update [<source>] [--skill <name>] [--scope] [--agent] [--yes] [--force] [--preview]
```

Without arguments, updates all. `--skill` filters by name or glob. Optional
`<source>` filters by origin (owner/repo, path, URL).

### skills new

```
axm skills new <name> [--profile @handle] [--agent <id>...] [--yes] [--force] [--preview]
```

Name: `[a-z0-9][a-z0-9-]*`, max 64 chars. Creates `skill.json` +
`src/SKILL.md`, registers in settings, creates agent symlinks. The scaffolded
manifest is named `skill.json` (not `axm-skill.json`).

### skills fork

```
axm skills fork <source> [--skill <pattern>] [--yes] [--force] [--preview]
```

Source: installed name, glob pattern, `github:owner/repo`, or local path.

```bash
axm skills fork code-review --yes
axm skills fork "effect-*" --yes
axm skills fork github:owner/repo --skill "effect-*" --yes
```

### skills publish

```
axm skills publish <extensions...> [--registry <name>] [--yes] [--force] [--preview]
```

Accepts names or glob patterns. Requires authentication.

```bash
axm skills publish my-skill --yes
axm skills publish effect-* commit --yes
```

### skills prune

```
axm skills prune [--scope project|user] [--yes] [<patterns...>]
```

Read-only by default. With `--yes`, removes unmanaged skill artifacts matching
optional glob patterns.

### skills enable / disable / rename

```
axm skills enable <name> [--scope] [--yes] [--force] [--preview]
axm skills disable <name> [--scope] [--yes] [--force] [--preview]
axm skills rename <old> <new> [--scope] [--yes] [--force] [--preview]
```

### packs install

```
axm packs install [<source>] [--scope] [--yes] [--force] [--preview]
```

Source: `@profile/packs/name[@version]` or bare name. Without `<source>`,
installs configured extension packs.

### packs publish

```
axm packs publish <pack> [--registry] [--include-dependencies|-d] [--yes] [--force] [--preview]
```

`-d` also publishes local extensions referenced by the extension pack.

### packs unpack

```
axm packs unpack <name> [--yes] [--force] [--preview] [--strict-agent-sync]
```

Ejects extension pack into individual extension entries in settings. Use `--preview`
first.

### packs new / add / remove / uninstall

```
axm packs new <name> [--profile] [--yes] [--force]
axm packs add <pack> <extension> [--yes] [--force]
axm packs remove <pack> <extension> [--yes] [--force]
axm packs uninstall <name> [--yes] [--force] [--preview]
```

### commands

```
axm commands install [<source>] [--scope] [--yes] [--force] [--preview]
axm commands uninstall <name> [--yes] [--force] [--preview]
axm commands list [--scope] [--json]
axm commands enable <name> [--scope] [--yes] [--force] [--preview]
axm commands disable <name> [--scope] [--yes] [--force] [--preview]
axm commands update [<name>] [--scope] [--yes] [--force] [--preview]
axm commands new <name> [--description <text>] [--profile @handle] [--yes] [--force] [--preview]
axm commands publish <extensions...> [--registry <name>] [--yes] [--force] [--preview]
```

Install source: `@profile/commands/name` or bare name. Without `<source>`,
installs configured commands. `commands new` creates a `command.json` manifest.

### subagents

```
axm subagents install [<source>] [--scope] [--subagent <name>] [--agent <id>] [--all] [--yes] [--force] [--preview]
axm subagents uninstall <subagent> [--yes] [--force] [--preview]
axm subagents list [--scope] [--agent <id>] [--json]
axm subagents update [<source>] [--scope] [--agent <id>] [--subagent <name>] [--yes] [--force] [--preview]
axm subagents new <name> [--profile @handle] [--agent <id>...] [--model fast|default|powerful|inherit] [--tool-access full|readonly|none] [--background] [--yes] [--force] [--preview]
axm subagents enable <name> [--scope] [--yes] [--force] [--preview]
axm subagents disable <name> [--scope] [--yes] [--force] [--preview]
axm subagents rename <old> <new> [--scope] [--yes] [--force] [--preview]
axm subagents publish <extensions...> [--registry <name>] [--yes] [--force] [--preview]
```

Install source forms mirror `skills install`: `@profile/subagents/name[@version]`,
`owner/repo`, `./path`, or URL. Without `<source>`, installs configured
subagents. `subagents new` creates a `subagent.json` manifest.

```bash
axm subagents install @acme/subagents/researcher --yes
axm subagents new my-helper --model powerful --tool-access readonly --yes
axm subagents publish my-helper --yes
```

### mcp-servers install / uninstall

```
axm mcp-servers install [<source>] [--scope] [--yes] [--force] [--preview]
axm mcp-servers uninstall <name> [--yes] [--force] [--preview]
```

Source: `@profile/mcp-servers/name` or bare name. Without `<source>`, installs
configured MCP servers.

### discover

```
axm discover [--path <dir>] [--json]
```

Scans the current project (or `--path <dir>`) for known dependency manifests
and surfaces compatible registry extensions. JSON envelope:
`{ _version, command, items, count, totalDetected, registryAvailable }`.

### lint

```
axm lint [--fix] [--scope project|user] [--strict] [--json] [<path>]
```

Evaluates workspace and per-extension invariants against the shared-kernel
rule catalogs (`skillRules`, `packRules`, `workspaceRules`). Findings are
structured: `rule id`, `severity` (`info|warn|error`), `message`, `location`.
Without `--fix`, the command is read-only. With `--fix`, autofixable findings
produce per-extension `Operation` values that replay through the plan pipeline
non-interactively (no prompts, no `--yes`).

| Flag       | Description                                                               |
| ---------- | ------------------------------------------------------------------------- |
| `--fix`    | Apply every autofixable finding via `resolvePlan` / `applyPlan`.          |
| `--scope`  | `project` (default) or `user` (`$AXM_USER_HOME` or `$HOME/.axm/`).        |
| `--strict` | Exit non-zero on warnings as well as errors.                              |
| `--json`   | Machine-readable findings envelope. `--json` is a global flag.            |
| `<path>`   | Workspace directory to lint (defaults to the current working directory). |

A **drift banner** appears at the top of the output when a workspace
`lint.rules` override weakens a platform-canonical `error` in `skill/*` or
`pack/*`. Workspace overrides affect `axm lint` only — the registry publish
gate stays platform-canonical.

Use `axm lint` as a first triage step; use `axm lint --fix` to reconcile
drift. Previewing is built-in: the read-only `axm lint` run is the preview.

`axm lint` replaces the removed `axm doctor` (diagnostic-only) and `axm sync`
(reconcile-only) commands.

### auth

```
axm auth login [--yes]      # Device login flow
axm auth logout             # Remove stored credentials
axm auth whoami [--json]    # Show authenticated identity
axm auth token [--json]     # Print auth token to stdout
```

The unprefixed forms (`axm login`, `axm logout`, `axm whoami`, `axm token`) are
aliases for the corresponding `axm auth <sub>` forms. For non-interactive auth,
set `AXM_TOKEN` instead of running `axm auth login`.

For sign-in probes in agent sessions, use:

```bash
axm auth whoami --json 2>/dev/null || echo '{"type":"error","code":"AUTH_LOGIN_REQUIRED"}'
```

### upgrade

```
axm upgrade [--force]
```

## Configuration

| Path                                                  | Purpose                        |
| ----------------------------------------------------- | ------------------------------ |
| `.axm/settings.json`                                  | Project-scope workspace config |
| `axm-lock.yaml`                                       | Resolved extension versions    |
| `$AXM_USER_HOME/.axm/settings.json` or `~/.axm/settings.json` | User-scope workspace config |
| `~/.config/axm/credentials.json`                      | Persisted registry credentials |

`credentials.json` is a versioned JSON document. It stores a `registries` map
keyed by registry URL; each registry entry has an `accounts` map keyed by
handle, with `access_token`, `refresh_token`, `expires_at`, and `active`.
Prefer `AXM_TOKEN` in CI or container contexts instead of relying on persisted
credentials.

| Variable                | Purpose                                    |
| ----------------------- | ------------------------------------------ |
| `AXM_TOKEN`             | Auth token (skips device code flow)        |
| `AXM_REGISTRY_LOCATION` | Override default registry source           |
| `AXM_REGISTRY_URL`      | Override remote registry API/auth endpoint |
| `AXM_USER_HOME`         | Override the user workspace root           |
| `AXM_TELEMETRY`         | `0` to disable                             |

## Error Handling

Exit codes:

- `0` = success or clean user cancellation
- `1` = expected command failure
- `2` = unexpected defect at the runtime boundary

JSON errors include `type: "error"`, `_version`, `code`, `message`, and often
`details`, `howToFix`, and `exitCode`.

| Error Code            | Recovery                                                                 |
| --------------------- | ------------------------------------------------------------------------ |
| `AUTH_LOGIN_REQUIRED` | Set `AXM_TOKEN` or run `axm auth login`; use the wrapped probe when checking sign-in state |
| Extension not found   | Verify FQN: `@profile/skills/name`                                       |
| Version conflict      | Use `--force` or adjust constraint                                       |
| Registry unreachable  | Check `AXM_REGISTRY_LOCATION` or `AXM_REGISTRY_URL`, verify connectivity |
| Workspace not init'd  | Run `axm setup --yes`                                                    |
| Prompt hanging        | Add `--yes` or `--non-interactive`                                       |

Use `--debug` for full error details including stack traces.

When the first attempt fails and recovery is ambiguous, summarize the failure
briefly and present options in this shape:

- `Recommended:` best next step for the user's likely goal
- `Alternative:` another reasonable path if it materially differs
- `Alternative:` optional second path if still plausible
- `Do nothing:` stop here and leave the current state unchanged
