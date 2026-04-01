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

Comprehensive CLI reference for the axm extension manager. Covers every command,
flag, workflow, and error recovery path. CLI version: 0.1.4.

## Agent Invariants

Follow these rules in every axm interaction. Violating them causes silent
failures or confusing output.

1. **JSON output.** Always use `--json` (or `-j`) for data commands. Parse
   structured output, not human-readable text. The CLI auto-detects non-TTY and
   outputs JSON, but be explicit.

2. **Non-interactive.** Always use `--yes` (or `-y`) for confirmations. Never
   let a prompt block. Use `--preview` first to inspect what will happen.

3. **Scope awareness.** Extensions exist at project scope (`.axm/settings.json`)
   or user scope (`~/.axm/`). Verify the appropriate scope before
   install/uninstall. Default is project scope.

4. **Preview before destructive actions.** Use `--preview` before `uninstall`,
   `unpack`, or `--force` operations to show what will change.

5. **Error handling.** Parse exit codes and error output. Exit code 0 = success,
   non-zero = failure. JSON error output includes an error code and message. Use
   the error code for programmatic recovery.

6. **No search command.** There is no `axm search` command yet. To find
   extensions, browse the registry website or use `axm skills list` to see
   what's installed.

## Output Modes

| Goal                   | Flag             | Format       |
| ---------------------- | ---------------- | ------------ |
| Structured data        | `--json` / `-j`  | JSON         |
| Human-readable display | (default)        | Text         |
| Minimal output         | `--quiet` / `-q` | Suppressed   |
| Debug diagnostics      | `--debug`        | Verbose text |
| Verbose errors         | `--verbose`      | Verbose text |

The CLI outputs JSON when piped (non-TTY) and text when interactive. The
`--json` flag is global and works on all commands. Some commands also support
shorthand aliases: `axm whoami --json`, `axm auth token --json`.

## CLI Introspection

Use `--help` on any command for text-based discovery:

```
axm --help                  # Root command list
axm skills --help           # Skills subcommands
axm skills install --help   # Full flag reference for install
```

Help output is human-readable text only — no JSON schema available.
Structure: DESCRIPTION → USAGE → ARGUMENTS → FLAGS → GLOBAL FLAGS → EXAMPLES.

## Quick Reference

| Task                           | Command                                          |
| ------------------------------ | ------------------------------------------------ |
| Initialize workspace           | `axm init --yes`                                 |
| Install skill from registry    | `axm skills install @profile/skills/name --yes`  |
| Install skill from GitHub      | `axm skills install owner/repo --yes`            |
| Install all skills from source | `axm skills install owner/repo --all --yes`      |
| Install skill from local path  | `axm skills install ./path --yes`                |
| Install pack                   | `axm packs install @profile/packs/name --yes`    |
| Install command                | `axm commands install @profile/commands/name`    |
| Install MCP server             | `axm mcp-servers install @profile/mcp-servers/n` |
| List installed skills          | `axm skills list --json`                         |
| List user-scope skills         | `axm skills list --scope user --json`            |
| Update all skills              | `axm skills update --yes`                        |
| Update specific skill          | `axm skills update --skill name --yes`           |
| Uninstall a skill              | `axm skills uninstall name --yes`                |
| Enable a skill                 | `axm skills enable name --yes`                   |
| Disable a skill                | `axm skills disable name --yes`                  |
| Rename a skill                 | `axm skills rename old new --yes`                |
| Fork a skill                   | `axm skills fork name --yes`                     |
| Create a new skill             | `axm skills new name --yes`                      |
| Create a new pack              | `axm packs new name --yes`                       |
| Add extension to pack          | `axm packs add pack ext --yes`                   |
| Publish a skill                | `axm skills publish name --yes`                  |
| Publish a pack                 | `axm packs publish name --yes`                   |
| Unpack a pack                  | `axm packs unpack name --yes`                    |
| Check auth status              | `axm whoami --json`                              |
| Print auth token               | `axm token`                                      |
| Login                          | `axm login`                                      |
| Logout                         | `axm logout`                                     |
| Upgrade axm                    | `axm upgrade`                                    |
| Preview install                | `axm skills install @p/skills/n --preview`       |

## Decision Trees

### Finding Extensions

```
Want to find an extension?
├── Know the FQN? → axm skills install @profile/skills/name --yes
├── Have a GitHub repo? → axm skills install owner/repo --yes
├── Want to browse installed? → axm skills list --json
└── Want to see what's in a pack? → axm packs unpack name --preview
```

### Managing Extensions

```
Want to manage an installed extension?
├── See all installed? → axm skills list --json
├── Update everything? → axm skills update --yes
├── Update one skill? → axm skills update --skill name --yes
├── Temporarily disable? → axm skills disable name --yes
│   └── Re-enable later? → axm skills enable name --yes
├── Customize a skill? → axm skills fork name --yes
├── Rename a skill? → axm skills rename old new --yes
└── Remove permanently? → axm skills uninstall name --yes
    └── Unsure? → axm skills uninstall name --preview (check first)
```

### Publishing Extensions

```
Want to publish an extension?
├── Creating a new skill? → axm skills new name --yes
│   └── Ready to publish? → axm skills publish name --yes
├── Creating a pack? → axm packs new name --yes
│   ├── Add skills to pack → axm packs add pack skill --yes
│   └── Publish pack → axm packs publish name --yes
│       └── Include dependencies? → axm packs publish name -d --yes
└── Preview before publish? → axm skills publish name --preview
```

### Workspace Setup

```
Setting up a workspace?
├── No .axm/ directory? → axm init --yes
│   ├── Empty repo? → Install skills for your use case
│   ├── Has existing skills on disk? → axm skills list --json (check Unmanaged)
│   │   ├── Want axm to manage it? → axm skills install <source> --yes
│   │   ├── Want to customize it? → axm skills fork <name> --yes
│   │   └── Want to hide it? → Add to ignored patterns in settings
│   └── Has tool-managed skills? → Leave as Unmanaged, do not modify
└── Already has .axm/? → axm skills list --json (review current state)
    ├── Unmanaged skills to adopt? → axm skills install <source> --yes
    ├── Outdated skills? → axm skills update --yes
    └── Disabled skills to re-enable? → axm skills enable name --yes
```

## Common Workflows

### Search and Install a Skill

```bash
# 1. Browse the registry or know the source
# 2. Preview what will be installed
axm skills install @acme/skills/code-review --preview

# 3. Install
axm skills install @acme/skills/code-review --yes

# 4. Verify
axm skills list --json
```

### Set Up a New Project Workspace

```bash
# 1. Initialize axm in the project
axm init --yes

# 2. Verify default extensions installed
axm skills list --json

# 3. Install additional skills for the project
axm skills install @acme/skills/code-review --yes
axm skills install owner/repo --all --yes

# 4. Verify final state
axm skills list --json
```

### Publish a New Extension

```bash
# 1. Create the skill scaffold
axm skills new my-skill --yes

# 2. Edit .axm/extensions/@<profile>/skills/my-skill/src/SKILL.md

# 3. Preview publication
axm skills publish my-skill --preview

# 4. Publish to registry
axm skills publish my-skill --yes

# 5. Verify on registry
axm skills install @<profile>/skills/my-skill --preview
```

### Update All Extensions in a Project

```bash
# 1. Preview available updates
axm skills update --preview

# 2. Apply all updates
axm skills update --yes

# 3. Verify
axm skills list --json
```

### Fork and Customize a Skill

```bash
# 1. Fork the installed skill
axm skills fork code-review --yes

# 2. Edit the forked SKILL.md
# Location: .axm/extensions/@<profile>/skills/code-review/src/SKILL.md

# 3. Optionally rename with a descriptive name
axm skills rename code-review team-code-review --yes

# 4. Verify
axm skills list --json
```

### Migrate Claude Code Plugins to axm

```bash
# 1. Audit — Enumerate existing Claude Code extensions
# Scan: .claude/settings.json, .claude/skills/, .claude/commands/

# 2. Initialize axm workspace
axm init --yes

# 3. For each skill that has a registry equivalent:
axm skills install @profile/skills/equivalent --yes

# 4. For skills with no equivalent, create new ones:
axm skills new my-migrated-skill --yes
# Copy SKILL.md content from .claude/skills/<name>/SKILL.md

# 5. Bundle related extensions into a pack (optional):
axm packs new my-toolkit --yes
axm packs add my-toolkit my-migrated-skill --yes

# 6. Verify all skills are installed
axm skills list --json

# 7. Publish for team sharing (optional)
axm skills publish my-migrated-skill --yes
axm packs publish my-toolkit --yes
```

### Migrate a Skill Pack Repo to axm

```bash
# 1. Analyze source repo — enumerate skills (dirs with SKILL.md)

# 2. Create individual skills
axm skills new skill-one --yes
axm skills new skill-two --yes
# Migrate SKILL.md content from source repo into each

# 3. Create pack
axm packs new my-pack --yes
axm packs add my-pack skill-one --yes
axm packs add my-pack skill-two --yes

# 4. Test locally
axm skills list --json

# 5. Publish individual skills and pack
axm skills publish skill-one skill-two --yes
axm packs publish my-pack --include-dependencies --yes
```

### Adopt Unmanaged Skills After Init

```bash
# 1. List all skills and identify Unmanaged ones
axm skills list --json

# 2. For each Unmanaged skill, decide:
# Adopt (has a GitHub source):
axm skills install owner/repo --skill skill-name --yes

# Fork (want to customize):
axm skills fork skill-name --yes

# 3. Verify classification changed
axm skills list --json
```

### Transition from Script-Managed Skills

```bash
# 1. Identify skills managed by skills.sh or similar scripts

# 2. Install each via axm with GitHub source
axm skills install owner/repo --skill skill-name --yes

# 3. Verify all expected skills are Configured
axm skills list --json

# 4. Retire the old script after verification
```

## Workspace Setup Scenarios

After `axm init`, the workspace may be in one of these states. Identify yours
and follow the guidance.

### Empty Workspace (Greenfield)

**Detection:** No `.axm/`, no `.claude/`, no skill files on disk.

**After `axm init`:** Creates `.axm/settings.json` and `axm-lock.yaml`. Installs
default extensions (including this skill). All extensions are **Configured**.

**Next steps:**

```bash
axm init --yes
axm skills install @acme/skills/code-review --yes
axm skills list --json
```

### Greenfield with Agent Config

**Detection:** Has `.claude/` or agent config but no skills or extensions.

**After `axm init`:** Creates `.axm/` alongside existing agent config. No
conflicts — axm config coexists with agent-native config.

**Next steps:** Install skills via axm. Understand scope precedence: project
`.axm/` settings override user `~/.axm/` settings.

### Brownfield with Unmanaged Skills

**Detection:** Has skill files on disk (`.claude/skills/`, cloned repos, manual
SKILL.md files) not managed by axm.

**After `axm init`:** Creates `.axm/`. Existing skills detected as
**Unmanaged** — visible but not axm-managed.

**For each Unmanaged skill, decide:**

- **Adopt:** `axm skills install <source> --yes` — makes it Configured with
  source tracking. Use when a registry/GitHub source exists and updates wanted.
- **Fork:** `axm skills fork <name> --yes` — creates an editable local copy.
  Use when customization is needed.
- **Ignore:** Add to ignored patterns in settings. Hides from axm views.
- **Leave as-is:** Unmanaged skills still function. Adoption is optional.

**Fork naming:** Prefer descriptive names (`team-code-review`,
`strict-security-policy`) over generic suffixes (`code-review-fork`).

### Brownfield with Tool-Managed Skills

**Detection:** Skills installed/updated by other tools (scaffolders, generators).

**After `axm init`:** Creates `.axm/`. Tool-managed skills appear as
**Unmanaged** unless the tool uses axm internally.

**Key guidance:**

- **Do not modify** tool-managed skills via axm without user confirmation.
- **Coexistence** is the default — axm manages its own extensions, tool-managed
  skills remain separate.
- **Adoption risk:** If you install a tool-managed skill via axm, axm updates
  may diverge from the tool's updates.

### Brownfield with Script-Managed Skills

**Detection:** Skills sourced from GitHub via `skills.sh`, git clone, or custom
scripts. Source of truth is the remote repo.

**Transition path:**

```bash
# Install via axm preserving GitHub source
axm skills install owner/repo --skill skill-name --yes

# Decide: track (follow upstream) or fork (diverge locally)
# Track = receive upstream updates via `axm skills update`
# Fork = `axm skills fork skill-name --yes` for local ownership

# Verify all skills migrated
axm skills list --json

# Retire old script after verification
```

### Brownfield Already Using axm

**Detection:** Has `.axm/settings.json` and `axm-lock.yaml`.

**`axm init` is idempotent** — safe to re-run.

**Next steps:** Review current state via `axm skills list --json`. Check for
Unmanaged skills to adopt, outdated skills to update, disabled skills to
re-enable.

## Command Reference

Global flags available on all commands:

| Flag                | Description                          |
| ------------------- | ------------------------------------ |
| `--help`, `-h`      | Show help                            |
| `--version`         | Show version                         |
| `--json`, `-j`      | Output machine-readable JSON         |
| `--quiet`, `-q`     | Suppress non-essential output        |
| `--verbose`, `-v`   | Show additional diagnostic details   |
| `--debug`           | Full debug details (implies verbose) |
| `--non-interactive` | Disable all interactive prompts      |
| `--log-level`       | Set minimum log level                |

### init

Set up axm in the current project.

```
axm init [flags]
```

| Flag               | Description                             |
| ------------------ | --------------------------------------- |
| `--scope <choice>` | `project` (default) or `user`           |
| `--agent <string>` | Specify agent(s) (skips auto-detection) |
| `--yes`, `-y`      | Auto-accept confirmation                |
| `--force`, `-f`    | Override constraints                    |
| `--preview`        | Display plan without applying           |

```bash
axm init --yes                              # Standard init
axm init --scope user                       # Init in ~/.axm/
axm init --agent claude-code --agent cursor # Specific agents
axm init --preview                          # See what would happen
```

Creates `.axm/settings.json` and `axm-lock.yaml`. Detects installed agents
automatically. Installs default extensions. Idempotent — safe to re-run.

### skills install

Install skills from a registry, GitHub, or local path.

```
axm skills install [flags] <source>
```

**Source formats:**

- Registry: `@profile/skills/name` or `@profile/skills/name@^1.0.0`
- GitHub: `owner/repo`
- Local: `./path/to/skills`

| Flag               | Description                                    |
| ------------------ | ---------------------------------------------- |
| `--scope <choice>` | `project` (default) or `user`                  |
| `--skill <string>` | Cherry-pick specific skill(s) from source      |
| `--all`            | Install every skill from source without prompt |
| `--yes`, `-y`      | Skip confirmation                              |
| `--force`, `-f`    | Reinstall even if already exists               |
| `--preview`        | Show what would be installed                   |

```bash
axm skills install @acme/skills/code-review --yes
axm skills install @acme/skills/code-review@^1.0.0 --yes
axm skills install owner/repo --yes
axm skills install owner/repo --all --yes
axm skills install ./path/to/skills --yes
axm skills install @acme/skills/code-review --preview
```

### skills uninstall

Remove a skill from agents. **Destructive** — preview first.

```
axm skills uninstall [flags] <skill>
```

| Flag            | Description                                  |
| --------------- | -------------------------------------------- |
| `--yes`, `-y`   | Skip confirmation                            |
| `--force`, `-f` | Remove even if other extensions depend on it |
| `--preview`     | Show what would be removed                   |

```bash
axm skills uninstall my-skill --preview     # Check first
axm skills uninstall my-skill --yes         # Remove
```

### skills list

List installed skills.

```
axm skills list [flags]
```

Aliases: `axm skills ls`

| Flag               | Description                            |
| ------------------ | -------------------------------------- |
| `--scope <choice>` | `project` (default) or `user`          |
| `--agent <string>` | Show only skills for specific agent(s) |

```bash
axm skills list --json
axm skills list --scope user --json
axm skills list --agent claude-code --json
```

### skills update

Update installed skills to latest versions.

```
axm skills update [flags] [<source>]
```

| Flag               | Description                                   |
| ------------------ | --------------------------------------------- |
| `--scope <choice>` | `project` (default) or `user`                 |
| `--agent <string>` | Update only skills for specific agent(s)      |
| `--skill <string>` | Update only specific skill(s) by name or glob |
| `--yes`, `-y`      | Apply updates without confirmation            |
| `--force`, `-f`    | Update even if version constraints prevent it |
| `--preview`        | Show available updates without applying       |

```bash
axm skills update --yes                     # Update all
axm skills update --skill code-review --yes # Update one
axm skills update owner/repo --yes          # Update from source
axm skills update --preview                 # Preview updates
```

### skills new

Create a new skill scaffold.

```
axm skills new [flags] <name>
```

Name must match `[a-z0-9][a-z0-9-]*` (max 64 chars).

| Flag                 | Description                              |
| -------------------- | ---------------------------------------- |
| `--profile <string>` | Override workspace profile (e.g., @acme) |
| `--agent <string>`   | Agent IDs to target (repeatable)         |
| `--yes`, `-y`        | Create without confirmation              |
| `--force`, `-f`      | Overwrite if exists                      |
| `--preview`          | Show what would be created               |

```bash
axm skills new my-skill --yes
axm skills new my-skill --profile @acme --yes
```

Creates: `.axm/extensions/@<profile>/skills/<name>/axm-skill.json` and
`.axm/extensions/@<profile>/skills/<name>/src/SKILL.md`. Registers in
`.axm/settings.json`. Creates agent symlinks.

### skills fork

Fork a skill for customization.

```
axm skills fork [flags] <source>
```

Source can be: installed skill name, glob pattern, or source string
(`github:owner/repo`, local path).

| Flag               | Description                                  |
| ------------------ | -------------------------------------------- |
| `--skill <string>` | Fork only specific skill(s) matching pattern |
| `--yes`, `-y`      | Fork without confirmation                    |
| `--force`, `-f`    | Overwrite if forked copy exists              |
| `--preview`        | Show what would be forked                    |

```bash
axm skills fork code-review --yes
axm skills fork "effect-*" --yes           # Fork by glob
axm skills fork github:owner/repo --yes
axm skills fork ./local/path --skill "effect-*" --yes
```

After forking, rename with a descriptive name:
`axm skills rename code-review team-code-review --yes`

### skills enable

Enable a previously disabled skill.

```
axm skills enable [flags] <name>
```

| Flag               | Description                              |
| ------------------ | ---------------------------------------- |
| `--scope <choice>` | `project` (default) or `user`            |
| `--yes`, `-y`      | Enable without confirmation              |
| `--force`, `-f`    | Enable even with unresolved dependencies |
| `--preview`        | Show what would change                   |

```bash
axm skills enable code-review --yes
axm skills enable code-review --preview
```

### skills disable

Disable a skill without uninstalling. The skill remains installed but inactive.

```
axm skills disable [flags] <name>
```

| Flag               | Description                         |
| ------------------ | ----------------------------------- |
| `--scope <choice>` | `project` (default) or `user`       |
| `--yes`, `-y`      | Disable without confirmation        |
| `--force`, `-f`    | Disable even if other skills depend |
| `--preview`        | Show what would change              |

```bash
axm skills disable code-review --yes
axm skills disable code-review --scope user --yes
```

### skills rename

Rename a skill.

```
axm skills rename [flags] <old-name> <new-name>
```

| Flag               | Description                       |
| ------------------ | --------------------------------- |
| `--scope <choice>` | `project` (default) or `user`     |
| `--yes`, `-y`      | Rename without confirmation       |
| `--force`, `-f`    | Rename even if new name conflicts |
| `--preview`        | Show what would change            |

```bash
axm skills rename old-name new-name --yes
axm skills rename old-name new-name --preview
```

### skills publish

Publish skills to a registry.

```
axm skills publish [flags] <extensions...>
```

Accepts skill names or glob patterns.

| Flag                  | Description                    |
| --------------------- | ------------------------------ |
| `--registry <string>` | Target specific named registry |
| `--yes`, `-y`         | Publish without confirmation   |
| `--force`, `-f`       | Publish even if version exists |
| `--preview`           | Show what would be published   |

```bash
axm skills publish my-skill --yes
axm skills publish @acme/skills/code-review --yes
axm skills publish effect-* commit --yes    # Glob + multiple
axm skills publish my-skill --registry local --yes
axm skills publish my-skill --preview
```

Requires authentication. Use `axm whoami --json` to verify.

### packs install

Install a pack and its extensions from a registry.

```
axm packs install [flags] <source>
```

Source: `@profile/packs/name`, `@profile/packs/name@version`, or bare name.

| Flag               | Description                   |
| ------------------ | ----------------------------- |
| `--scope <choice>` | `project` (default) or `user` |
| `--yes`, `-y`      | Skip confirmation             |
| `--force`, `-f`    | Reinstall even if exists      |
| `--preview`        | Show what would be installed  |

```bash
axm packs install @acme/packs/frontend-tools --yes
axm packs install @acme/packs/frontend-tools@^2.0.0 --yes
axm packs install frontend-tools --yes      # Bare name
axm packs install @acme/packs/frontend-tools --preview
```

### packs uninstall

Remove a pack. **Destructive** — preview first.

```
axm packs uninstall [flags] <name>
```

Accepts name or glob pattern.

| Flag            | Description                              |
| --------------- | ---------------------------------------- |
| `--yes`, `-y`   | Skip confirmation                        |
| `--force`, `-f` | Remove even if extensions used elsewhere |
| `--preview`     | Show what would be removed               |

```bash
axm packs uninstall my-pack --preview       # Check first
axm packs uninstall my-pack --yes           # Remove
axm packs uninstall "acme-*" --yes          # Glob pattern
```

### packs new

Create a new empty extension pack.

```
axm packs new [flags] <name>
```

| Flag                 | Description                 |
| -------------------- | --------------------------- |
| `--profile <string>` | Override workspace profile  |
| `--yes`, `-y`        | Create without confirmation |
| `--force`, `-f`      | Overwrite if exists         |
| `--preview`          | Show what would be created  |

```bash
axm packs new frontend-tools --yes
axm packs new frontend-tools --profile @acme --yes
```

### packs add

Add an extension to a pack manifest.

```
axm packs add [flags] <pack> <extension>
```

| Flag            | Description                 |
| --------------- | --------------------------- |
| `--yes`, `-y`   | Add without confirmation    |
| `--force`, `-f` | Add even if already in pack |
| `--preview`     | Show what would change      |

```bash
axm packs add frontend-tools @acme/skills/code-review --yes
axm packs add my-pack "effect-*" --yes     # Glob pattern
```

### packs remove

Remove an extension from a pack manifest.

```
axm packs remove [flags] <pack> <extension>
```

| Flag            | Description                        |
| --------------- | ---------------------------------- |
| `--yes`, `-y`   | Remove without confirmation        |
| `--force`, `-f` | Remove even if it empties the pack |
| `--preview`     | Show what would change             |

```bash
axm packs remove frontend-tools @acme/skills/code-review --yes
axm packs remove my-pack "@acme/effect-*" --yes
```

### packs publish

Publish a pack to a registry.

```
axm packs publish [flags] <pack>
```

| Flag                           | Description                               |
| ------------------------------ | ----------------------------------------- |
| `--registry <string>`          | Target specific named registry            |
| `--include-dependencies`, `-d` | Also publish local extensions in the pack |
| `--yes`, `-y`                  | Publish without confirmation              |
| `--force`, `-f`                | Publish even if version exists            |
| `--preview`                    | Show what would be published              |

```bash
axm packs publish @acme/frontend-tools --yes
axm packs publish frontend-tools --registry local --yes
axm packs publish @acme/frontend-tools -d --yes  # Include deps
axm packs publish @acme/frontend-tools --preview
```

### packs unpack

Eject a pack into individual extension entries. Replaces the pack reference in
settings with individual entries for each extension.

```
axm packs unpack [flags] <name>
```

| Flag                  | Description                                 |
| --------------------- | ------------------------------------------- |
| `--strict-agent-sync` | Fail on strict-policy MCP agent sync errors |
| `--yes`, `-y`         | Eject without confirmation                  |
| `--force`, `-f`       | Overwrite existing individual entries       |
| `--preview`           | Show what would change                      |

```bash
axm packs unpack @acme/frontend-tools --preview  # Check first
axm packs unpack @acme/frontend-tools --yes
```

### commands install

Install a command from a registry.

```
axm commands install [flags] <source>
```

Source: `@profile/commands/name` or bare name.

| Flag               | Description                   |
| ------------------ | ----------------------------- |
| `--scope <choice>` | `project` (default) or `user` |
| `--yes`, `-y`      | Skip confirmation             |
| `--force`, `-f`    | Reinstall even if exists      |
| `--preview`        | Show what would be installed  |

```bash
axm commands install @acme/commands/my-cmd --yes
axm commands install my-cmd --yes
axm commands install @acme/commands/my-cmd --preview
```

### commands uninstall

Remove a command.

```
axm commands uninstall [flags] <name>
```

| Flag            | Description                             |
| --------------- | --------------------------------------- |
| `--yes`, `-y`   | Skip confirmation                       |
| `--force`, `-f` | Remove even if referenced by other exts |
| `--preview`     | Show what would be removed              |

```bash
axm commands uninstall my-cmd --preview
axm commands uninstall my-cmd --yes
```

### mcp-servers install

Install an MCP server from a registry.

```
axm mcp-servers install [flags] <source>
```

Source: `@profile/mcp-servers/name` or bare name.

| Flag               | Description                   |
| ------------------ | ----------------------------- |
| `--scope <choice>` | `project` (default) or `user` |
| `--yes`, `-y`      | Skip confirmation             |
| `--force`, `-f`    | Reinstall even if exists      |
| `--preview`        | Show what would be installed  |

```bash
axm mcp-servers install @acme/mcp-servers/my-server --yes
axm mcp-servers install my-server --yes
axm mcp-servers install @acme/mcp-servers/my-server --preview
```

### mcp-servers uninstall

Remove an MCP server.

```
axm mcp-servers uninstall [flags] <name>
```

| Flag            | Description                                    |
| --------------- | ---------------------------------------------- |
| `--yes`, `-y`   | Skip confirmation                              |
| `--force`, `-f` | Remove even if agents are configured to use it |
| `--preview`     | Show what would be removed                     |

```bash
axm mcp-servers uninstall my-server --preview
axm mcp-servers uninstall my-server --yes
```

### auth login

Sign in to a registry via device code OAuth flow. Requires TTY (interactive
terminal). For non-interactive environments, set `AXM_TOKEN` instead.

```
axm auth login [flags]
```

Shortcut: `axm login`

| Flag          | Description                    |
| ------------- | ------------------------------ |
| `--yes`, `-y` | Skip browser-open confirmation |

```bash
axm login                                  # Interactive login
axm login --yes                            # Skip browser prompt
```

### auth logout

Sign out of a registry. Removes stored credentials.

```
axm auth logout
```

Shortcut: `axm logout`

```bash
axm logout
```

### auth whoami

Show current authenticated identity.

```
axm auth whoami [flags]
```

Shortcut: `axm whoami`

```bash
axm whoami --json                          # Structured output
```

### auth token

Output current auth token to stdout. Useful for piping to other tools.

```
axm auth token [flags]
```

Shortcut: `axm token`

```bash
axm token                                  # Print token
axm token --json                           # Structured output
AXM_TOKEN=$(axm token)                     # Capture for scripting
```

### upgrade

Update axm to the latest version.

```
axm upgrade [flags]
```

| Flag            | Description                            |
| --------------- | -------------------------------------- |
| `--force`, `-f` | Re-download even if already up to date |

```bash
axm upgrade
axm upgrade --force
```

## Configuration

### File Locations

| Path                   | Purpose                    |
| ---------------------- | -------------------------- |
| `.axm/settings.json`   | Project-scope config       |
| `.axm/extensions/`     | Installed extension files  |
| `axm-lock.yaml`        | Lockfile (version pins)    |
| `~/.axm/settings.json` | User-scope config          |
| `~/.axm/extensions/`   | User-scope extension files |

### Environment Variables

| Variable           | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| `AXM_TOKEN`        | Auth token (skips device code flow)                       |
| `AXM_REGISTRY_URL` | Override registry endpoint (default: registry.agentxm.ai) |
| `AXM_TELEMETRY`    | Set to `0` to disable telemetry                           |

### Scope Semantics

- **Project scope** (default): `.axm/settings.json` in the current directory.
  Extensions are available to all agents in this project.
- **User scope**: `~/.axm/settings.json`. Extensions available globally across
  all projects.
- Project scope takes precedence over user scope for overlapping extensions.
- Use `--scope user` on install/uninstall/list/update to target user scope.

## Error Handling

### Exit Codes

| Code | Meaning         |
| ---- | --------------- |
| 0    | Success         |
| 1    | General failure |

### Common Errors and Recovery

| Symptom                     | Likely Cause              | Recovery                                      |
| --------------------------- | ------------------------- | --------------------------------------------- |
| Auth error / login required | Not authenticated         | Set `AXM_TOKEN` env var or run `axm login`    |
| Extension not found         | Wrong FQN or spelling     | Verify FQN format: `@profile/skills/name`     |
| Version conflict            | Constraint mismatch       | Use `--force` or adjust version constraint    |
| Registry unreachable        | Network or URL issue      | Check `AXM_REGISTRY_URL`, verify connectivity |
| Permission denied           | Token scope insufficient  | Re-authenticate with `axm login`              |
| Missing config              | Workspace not initialized | Run `axm init --yes`                          |
| Skill already exists        | Duplicate install         | Use `--force` to reinstall                    |
| Interactive prompt hanging  | Non-TTY environment       | Add `--yes` flag or set `--non-interactive`   |

### Diagnostics

When troubleshooting, use verbose or debug flags for more detail:

```bash
axm skills install @acme/skills/code-review --yes --verbose
axm skills install @acme/skills/code-review --yes --debug
```

`--debug` implies `--verbose` and shows full error details including stack
traces.
