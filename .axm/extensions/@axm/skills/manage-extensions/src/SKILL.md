---
name: manage-extensions
description: |
  Manage AI agent extensions via the axm CLI. Install, publish,
  and manage skills, commands, MCP servers, packs, and other extension types.
  Use for ANY axm or AgentXM question or action.
cli-version-audited: "0.1.4"
triggers:
  # Direct invocations
  - axm
  - /axm
  # Extension lifecycle
  - axm install
  - axm uninstall
  - axm publish
  - axm update
  - axm init
  # Domain commands
  - axm skills
  - axm packs
  - axm commands
  - axm mcp-servers
  - axm auth
  # Common intents
  - install extension
  - install skill
  - install pack
  - install command
  - install mcp server
  - publish extension
  - manage extensions
  - update extensions
  # Questions
  - how do I axm
  - what extensions
  - does axm
invocable: true
argument-hint: "[action] [args...]"
---

# manage-extensions

CLI reference for the axm extension manager (v0.1.4).

## Agent Invariants

1. **JSON output.** Use `--json` for data commands. The CLI auto-detects
   non-TTY but be explicit.
2. **Non-interactive.** Use `--yes` for confirmations. Use `--preview` to
   inspect first.
3. **Scope awareness.** Project scope (`.axm/`) is default. Use `--scope user`
   for `~/.axm/`. Project takes precedence.
4. **Preview before destructive actions.** Use `--preview` before `uninstall`,
   `unpack`, or `--force`.
5. **Error handling.** Exit 0 = success. Non-zero = failure with JSON error
   including error code and message.
6. **No search command.** No `axm search` yet. Browse the registry or use
   `axm skills list`.

## Output Modes

| Goal              | Flag             | Format     |
| ----------------- | ---------------- | ---------- |
| Structured data   | `--json` / `-j`  | JSON       |
| Human-readable    | (default)        | Text       |
| Minimal output    | `--quiet` / `-q` | Suppressed |
| Debug diagnostics | `--debug`        | Verbose    |

## Quick Reference

| Task                           | Command                                                   |
| ------------------------------ | --------------------------------------------------------- |
| Initialize workspace           | `axm init --yes`                                          |
| Install skill from registry    | `axm skills install @profile/skills/name --yes`           |
| Install skill from GitHub      | `axm skills install owner/repo --yes`                     |
| Install all skills from source | `axm skills install owner/repo --all --yes`               |
| Install skill from local path  | `axm skills install ./path --yes`                         |
| Install pack                   | `axm packs install @profile/packs/name --yes`             |
| Install command                | `axm commands install @profile/commands/n --yes`          |
| Install MCP server             | `axm mcp-servers install @p/mcp-servers/n --yes`          |
| List installed skills          | `axm skills list --json`                                  |
| Update all skills              | `axm skills update --yes`                                 |
| Update specific skill          | `axm skills update --skill name --yes`                    |
| Uninstall a skill              | `axm skills uninstall name --yes`                         |
| Enable / disable a skill       | `axm skills enable name` / `disable name`                 |
| Fork a skill                   | `axm skills fork name --yes`                              |
| Create a new skill             | `axm skills new name --yes`                               |
| Publish a skill                | `axm skills publish name --yes`                           |
| Create and publish a pack      | `axm packs new n` / `packs add n ext` / `packs publish n` |
| Unpack a pack                  | `axm packs unpack name --yes`                             |
| Check auth status              | `axm whoami --json`                                       |
| Login / logout                 | `axm login` / `axm logout`                                |
| Upgrade axm                    | `axm upgrade`                                             |

## Decision Trees

```
Setting up a workspace?
├── No .axm/? → axm init --yes
│   ├── Empty repo → Install skills for your use case
│   ├── Has existing skills on disk → axm skills list --json (check Unmanaged)
│   │   ├── Adopt → axm skills install <source> --yes
│   │   ├── Customize → axm skills fork <name> --yes
│   │   └── Hide → Add to ignored patterns in settings
│   └── Tool-managed skills → Leave as Unmanaged, do not modify
└── Already has .axm/ → axm skills list --json (review current state)

Want to find/install an extension?
├── Know the FQN → axm skills install @profile/skills/name --yes
├── Have a GitHub repo → axm skills install owner/repo --yes
└── Browse installed → axm skills list --json

Want to publish?
├── New skill → axm skills new name → edit SKILL.md → axm skills publish name
├── New pack → axm packs new name → axm packs add → axm packs publish name
└── Include pack deps → axm packs publish name -d --yes
```

## Common Workflows

### Set Up a New Project

```bash
axm init --yes
axm skills install @acme/skills/code-review --yes
axm skills install owner/repo --all --yes
axm skills list --json
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
axm init --yes

# 2. For skills with registry equivalents:
axm skills install @profile/skills/equivalent --yes

# 3. For unique skills, create new:
axm skills new my-skill --yes
# Copy SKILL.md content from .claude/skills/<name>/

# 4. Optionally bundle into a pack:
axm packs new my-toolkit --yes
axm packs add my-toolkit my-skill --yes
axm packs publish my-toolkit -d --yes
```

### Adopt Unmanaged Skills After Init

```bash
axm skills list --json                              # Identify Unmanaged
axm skills install owner/repo --skill name --yes    # Adopt
axm skills fork name --yes                          # Or customize
axm skills list --json                              # Verify
```

## Workspace Setup Scenarios

### Greenfield (no agent tooling)

`axm init --yes` creates `.axm/settings.json`, `axm-lock.yaml`, installs
default extensions. All extensions are **Configured**. Install skills for your
use case.

### Greenfield with Agent Config

Has `.claude/` but no extensions. `axm init` layers alongside — no conflicts.
Project `.axm/` overrides user `~/.axm/`.

### Brownfield with Unmanaged Skills

Has skills on disk not managed by axm. After `axm init`, detected as
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

`axm init` is idempotent. Review with `axm skills list --json`.

## Command Reference

Global flags: `--json`, `--quiet`, `--verbose`, `--debug`, `--non-interactive`,
`--help`, `--version`, `--log-level`. Standard mutation flags on most commands:
`--yes`, `--force`, `--preview`, `--scope <project|user>`.

### init

```
axm init [--scope project|user] [--agent <id>...] [--yes] [--force] [--preview]
```

Creates `.axm/settings.json` and `axm-lock.yaml`. Auto-detects installed agents.
Installs default extensions. Idempotent. Use `--agent` to skip detection.

### skills install

```
axm skills install [flags] <source>
```

Source formats: `@profile/skills/name[@version]` (registry), `owner/repo`
(GitHub), `./path` (local).

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
axm skills new <name> [--profile @handle] [--agent <id>...] [--yes] [--force]
```

Name: `[a-z0-9][a-z0-9-]*`, max 64 chars. Creates `axm-skill.json` +
`src/SKILL.md`, registers in settings, creates agent symlinks.

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

### skills enable / disable / rename

```
axm skills enable <name> [--scope] [--yes] [--force] [--preview]
axm skills disable <name> [--scope] [--yes] [--force] [--preview]
axm skills rename <old> <new> [--scope] [--yes] [--force] [--preview]
```

### packs install

```
axm packs install <source> [--scope] [--yes] [--force] [--preview]
```

Source: `@profile/packs/name[@version]` or bare name.

### packs publish

```
axm packs publish <pack> [--registry] [--include-dependencies|-d] [--yes] [--force] [--preview]
```

`-d` also publishes local extensions referenced by the pack.

### packs unpack

```
axm packs unpack <name> [--yes] [--force] [--preview] [--strict-agent-sync]
```

Ejects pack into individual extension entries in settings. Use `--preview`
first.

### packs new / add / remove / uninstall

```
axm packs new <name> [--profile] [--yes] [--force]
axm packs add <pack> <extension> [--yes] [--force]
axm packs remove <pack> <extension> [--yes] [--force]
axm packs uninstall <name> [--yes] [--force] [--preview]
```

### commands install / uninstall

```
axm commands install <source> [--scope] [--yes] [--force] [--preview]
axm commands uninstall <name> [--yes] [--force] [--preview]
```

Source: `@profile/commands/name` or bare name.

### mcp-servers install / uninstall

```
axm mcp-servers install <source> [--scope] [--yes] [--force] [--preview]
axm mcp-servers uninstall <name> [--yes] [--force] [--preview]
```

Source: `@profile/mcp-servers/name` or bare name.

### auth

```
axm login [--yes]           # Device code OAuth flow (requires TTY)
axm logout                  # Remove stored credentials
axm whoami [--json]         # Show authenticated identity
axm token [--json]          # Print auth token to stdout
```

For non-interactive auth, set `AXM_TOKEN` env var instead of `axm login`.

### upgrade

```
axm upgrade [--force]
```

## Configuration

| Path                   | Purpose              |
| ---------------------- | -------------------- |
| `.axm/settings.json`   | Project-scope config |
| `axm-lock.yaml`        | Version pins         |
| `~/.axm/settings.json` | User-scope config    |

| Variable           | Purpose                             |
| ------------------ | ----------------------------------- |
| `AXM_TOKEN`        | Auth token (skips device code flow) |
| `AXM_REGISTRY_URL` | Override registry endpoint          |
| `AXM_TELEMETRY`    | `0` to disable                      |

## Error Handling

Exit 0 = success, non-zero = failure. JSON errors include `code` and `message`.

| Error Code            | Recovery                                      |
| --------------------- | --------------------------------------------- |
| `AUTH_LOGIN_REQUIRED` | Set `AXM_TOKEN` or run `axm login`            |
| Extension not found   | Verify FQN: `@profile/skills/name`            |
| Version conflict      | Use `--force` or adjust constraint            |
| Registry unreachable  | Check `AXM_REGISTRY_URL`, verify connectivity |
| Workspace not init'd  | Run `axm init --yes`                          |
| Prompt hanging        | Add `--yes` or `--non-interactive`            |

Use `--debug` for full error details including stack traces.
