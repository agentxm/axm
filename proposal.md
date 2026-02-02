---
status: draft
description: AXM design specification for extension management system
---

# AXM Design Specification

## 1. Overview

AXM is an open agent extension manager. It enables users to discover, install,
create, and share extensions that enhance AI coding assistant capabilities.

### 1.1 Goals

- Unified management of multiple extension types (skills, commands, packs, MCP
  servers, rules, agents)
- Support for multiple sources (registry, GitHub, GitLab, local filesystem)
- Familiar CLI experience for users of npm/pnpm/cargo
- Extension provenance and version tracking for updates
- Progressive disclosure: simple commands for common tasks, full control when
  needed

### 1.2 Non-Goals

- Runtime execution of extensions (handled by host agents)
- Extension sandboxing or security isolation
- Paid extension marketplace (future consideration)

---

## 2. Concepts & Terminology

### General Terms

| Term               | Definition                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------- |
| **Host Agent**     | An AI coding assistant that consumes extensions (e.g., Claude Code, Cursor, Windsurf)       |
| **Open Agent**     | A host agent interoperable with different models and extensible via common standards        |
| **Extension**      | A unit of functionality that enhances a host agent's capabilities                           |
| **Extension Type** | Category of extension determining its manifest schema and behavior                          |
| **Level**          | Context where configuration or extensions are stored: `project` (.axm/) or `user` (~/.axm/) |
| **Scope**          | Namespace for extensions, e.g., `@wayne` in `@wayne/grappling-hook`                         |
| **Source**         | Origin of an extension: registry, github, gitlab, bitbucket, azuredevops, git, url, or path |
| **Manifest**       | JSON file describing an extension's metadata (e.g., `axm-skill.json`)                       |
| **Implied Scope**  | Default scope used when resolving bare names (configured in settings)                       |

### Extension Types

| Term           | Definition                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------- |
| **Skill**      | Context-triggered or explicitly invoked instructions that guide agent behavior for specific tasks |
| **Command**    | User-invokable prompts that perform specific actions (similar to slash commands)                  |
| **Pack**       | A bundle of extensions distributed together for a specific purpose or workflow                    |
| **MCP Server** | A Model Context Protocol server that provides tools, resources, or context to agents              |
| **Rule**       | Persistent instructions that shape agent behavior across all interactions                         |
| **Agent**      | A sub-agent definition for delegating specialized tasks (distinct from the host agent)            |

---

## 3. Specifications

### 3.1 Extension Types & Manifests

Each extension type has a manifest file named `axm-<type>.json`. All manifests
share common fields with type-specific extensions.

#### Common Fields

| Field         | Type     | Required | Description                              |
| ------------- | -------- | -------- | ---------------------------------------- |
| `name`        | string   | Yes      | Fully qualified name (`@<scope>/<name>`) |
| `version`     | string   | Yes      | Semver version                           |
| `description` | string   | No       | Short description                        |
| `keywords`    | string[] | No       | Tags for discovery                       |
| `repository`  | string   | No       | Source repository URL                    |
| `homepage`    | string   | No       | Project homepage URL                     |
| `license`     | string   | No       | SPDX license identifier                  |
| `bugs`        | string   | No       | Issue tracker URL                        |
| `author`      | object   | No       | `{ name, email?, url? }`                 |

#### axm-skill.json

Context-triggered or invoked agent instructions.

> **Note:** The `description` field is highly recommended for skills. The CLI
> warns if a skill is missing a description.

```json
{
  "name": "@wayne/grappling-hook",
  "version": "1.0.0",
  "description": "Deploy grappling hook for rapid traversal"
}
```

#### axm-command.json

User-invokable agent prompts.

```json
{
  "name": "@wayne/batcomputer-sync",
  "version": "1.0.0",
  "description": "Sync data with the Batcomputer"
}
```

#### axm-pack.json

Bundle of extensions. References extensions by fully qualified name.

```json
{
  "name": "@wayne/utility-belt",
  "version": "1.0.0",
  "description": "Complete crime-fighting toolkit",
  "skills": ["@wayne/grappling-hook"],
  "mcp-servers": ["@wayne/batcomputer"],
  "commands": []
}
```

#### axm-mcp-server.json

MCP server configuration. Fields TBD.

```json
{
  "name": "@wayne/batcave-mcp",
  "version": "1.0.0",
  "description": "MCP server for Batcave systems"
}
```

#### axm-rule.json

Instructions that shape AI behavior. Fields TBD.

```json
{
  "name": "@wayne/no-killing-rule",
  "version": "1.0.0",
  "description": "The one rule that must never be broken"
}
```

#### axm-agent.json

Sub-agent for specialized tasks. Fields TBD.

```json
{
  "name": "@wayne/detective-agent",
  "version": "1.0.0",
  "description": "Agent specialized in forensic analysis"
}
```

---

### 3.2 Extension Resolution

Resolves an input string to zero or more extensions with metadata.

#### Parameters

| Parameter | Type      | Required | Description                                                                  |
| --------- | --------- | -------- | ---------------------------------------------------------------------------- |
| `input`   | string    | Yes      | The input string to resolve                                                  |
| `types`   | enum[]?   | No       | Limit resolution to specific extension types                                 |
| `sources` | enum[]?   | No       | Limit resolution to specific sources                                         |
| `agents`  | string[]? | No       | Limit to extension types supported by specified agents (default: configured) |

When `types` is provided, only matching extension types are returned. This
applies to all resolution methods: AXM name resolution searches only matching
type directories; path/source resolution filters results by inferred type.

When `sources` is provided, only the specified sources are queried for ambiguous
patterns and URL matching.

When `agents` is provided, resolution is limited to extension types supported by
the specified host agents. If not provided, defaults to agents configured in
settings.

#### Input Syntax

| Pattern                            | Example                         | Interpretation           |
| ---------------------------------- | ------------------------------- | ------------------------ |
| `<name>`                           | `grappling-hook`                | Bare name                |
| `@<scope>/<name>`                  | `@wayne/grappling-hook`         | Fully qualified AXM name |
| `<a>/<b>[/<path>]`                 | `myorg/skills`                  | Ambiguous slash pattern  |
| `<source>:<owner>/<repo>[/<path>]` | `github:myorg/skills`           | Explicit source          |
| Local path                         | `./skills`, `/abs/path`         | Filesystem path          |
| URL                                | `https://github.com/myorg/repo` | Remote resource          |

#### Resolution Order

Attempt in order. Stop at first match.

1. **Explicit local path** — Input is absolute path or starts with `./`/`../` →
   resolve as path

2. **Fully qualified AXM name** — Input matches `@<scope>/<name>` → lookup via
   AXM name resolution (see below). Return empty result if lookup finds nothing.

3. **Bare name with implied scope** — Input is `<name>` (no `/`) → if implied
   scope configured, lookup `@<implied-scope>/<name>` via AXM name resolution.
   Return empty result if no implied scope configured or lookup finds nothing.

4. **Explicit source** — Input matches `<source>:<owner>/<repo>[/<path>]` or is
   a URL matching a known source pattern → normalize if needed (original input
   preserved in `originalInput`), resolve via source

5. **Ambiguous slash pattern** — Input matches `<a>/<b>[/<path>]`:

   a. Check if path exists on local filesystem → if yes, resolve as path

   b. Lookup `@<a>/<b>` via AXM name resolution → if found, resolve as AXM
   extension

   c. Query enabled sources in parallel to check if `<a>/<b>` exists:
   - Exactly one exists → resolve via that source
   - Multiple exist → prompt user to select
   - None exist → return empty result

6. **Unmatched URL** — Input is URL not matching known sources → fetch as remote
   path

#### AXM Name Resolution

For fully qualified names (`@<scope>/<name>`), check levels in order:

1. **Project** — `.axm/<type>/@<scope>/<name>/` in current workspace
2. **Global** — `~/.axm/<type>/@<scope>/<name>/`
3. **Registry** — Remote AXM registry

At each level, search all type directories in parallel: `skills`, `commands`,
`packs`, `mcp-servers`, `rules`, `agents`. If `types` is provided, only search
matching type directories.

Stop at first level with matches. Return all matches found at that level.

#### Path Resolution

When resolution yields a local or remote path:

1. **File** → classify and process (see File Types)
2. **Directory** → scan for matching files (non-recursive)

#### File Types

> **Note:** This list is non-exhaustive. Additional vendor-specific and standard
> extension file formats will be specified separately.

| Type            | Examples                                                        | Yields                   |
| --------------- | --------------------------------------------------------------- | ------------------------ |
| AXM manifest    | `axm-skill.json`, `axm-command.json`, `axm-mcp-server.json`     | Single extension         |
| Standard skill  | `SKILL.md`, `SKILL.toml`                                        | Single extension         |
| Extension index | `axm-index.json`, `.well-known/skills/index.json`¹, `.mcp.json` | Zero or more extensions² |

¹ Per
[Agent Skills Discovery RFC](https://github.com/cloudflare/agent-skills-discovery-rfc)

² Index files are manifests describing extensions in the same directory
structure. Each entry contains metadata directly; `files` are relative paths
from the index file's location.

#### Type Inference

Extension type is determined by:

1. **AXM manifest** — File name pattern `axm-<type>.json` (e.g.,
   `axm-skill.json` → `skill`)
2. **Non-AXM files** — Type-specific patterns (e.g., `SKILL.md` → `skill`,
   `.mcp.json` → `mcp-server`)

#### Result Schema

Returns `ExtensionRef[]`. Empty array if nothing found.

**ExtensionRef fields:**

| Field           | Type    | Description                                                                      |
| --------------- | ------- | -------------------------------------------------------------------------------- |
| `type`          | enum    | `skill`, `command`, `pack`, `mcp-server`, `rule`, `agent`                        |
| `sourceType`    | enum    | `github`, `gitlab`, `bitbucket`, `azuredevops`, `git`, `url`, `path`, `registry` |
| `sourceOrigin`  | string  | Fully resolved value (URL, path, or registry identifier)                         |
| `ref`           | string? | Git ref (branch, tag, commit) if from git source                                 |
| `name`          | string? | Resolved name (e.g., `@scope/name`)                                              |
| `originalInput` | string  | Input string before normalization                                                |
| `metadata`      | object  | Additional data (see below)                                                      |

**Metadata fields (when available):**

| Field          | Type     | Description                                   |
| -------------- | -------- | --------------------------------------------- |
| `version`      | string   | Semver from manifest                          |
| `description`  | string   | From manifest                                 |
| `publisher`    | string   | Author/publisher name                         |
| `license`      | string   | SPDX identifier                               |
| `keywords`     | string[] | Tags for categorization                       |
| `files`        | string[] | Constituent files (for directory resolution)  |
| `dependencies` | string[] | Required extensions                           |
| `checksum`     | string   | Content hash for integrity                    |
| `size`         | number   | Total size in bytes                           |
| `lastModified` | string   | ISO 8601 timestamp                            |
| `sourceData`   | object   | Raw source-specific data (stars, forks, etc.) |

---

### 3.3 Sources

Sources define where extensions can be fetched from.

| Type          | Description               | Origin Pattern                                            | Shorthand Format                    |
| ------------- | ------------------------- | --------------------------------------------------------- | ----------------------------------- |
| `github`      | GitHub repositories       | `https://github.com/<owner>/<repo>[/tree/<ref>/<path>]`   | `github:<owner>/<repo>[/<path>]`    |
| `gitlab`      | GitLab repositories       | `https://gitlab.com/<owner>/<repo>[/-/tree/<ref>/<path>]` | `gitlab:<owner>/<repo>[/<path>]`    |
| `bitbucket`   | Bitbucket repositories    | `https://bitbucket.org/<owner>/<repo>[/src/<ref>/<path>]` | `bitbucket:<owner>/<repo>[/<path>]` |
| `azuredevops` | Azure DevOps repositories | `https://dev.azure.com/<org>/_git/<repo>[?path=<path>]`   | `azuredevops:<org>/<repo>[/<path>]` |
| `git`         | Generic git repositories  | `https://<host>/<path>.git`                               | `git:<url>`                         |
| `url`         | Direct URL to extension   | `https://<host>/<path>`                                   | (use URL directly)                  |
| `registry`    | AXM extension registry    | `https://registry.agentxm.ai/extensions/<scope>/<name>`   | `@<scope>/<name>`                   |

---

### 3.4 Settings

Settings can be configured at the project level (`.axm/settings.json`) or user
level (`~/.axm/settings.json`). Project settings override user settings.

```json
{
  "sources": {
    "enabled": ["github", "gitlab", "bitbucket", "azuredevops", "git"]
  },
  "agents": ["claude-code"],
  "impliedScope": "@myorg",
  "extensions": {
    "skills": {
      "@wayne/grappling-hook": "^1.0.0"
    },
    "mcp-servers": {
      "@wayne/batcomputer": "^2.0.0"
    }
  }
}
```

#### Fields

| Field             | Type     | Description                                                     |
| ----------------- | -------- | --------------------------------------------------------------- |
| `sources`         | object   | Source configuration                                            |
| `sources.enabled` | string[] | List of enabled source types (all enabled by default)           |
| `agents`          | string[] | Host agents to consider for extension resolution (default: all) |
| `impliedScope`    | string   | Default scope for bare name resolution                          |
| `extensions`      | object   | Desired extensions by type (similar to npm dependencies)        |

The `extensions` field maps extension type to a dictionary of name → version
specifier. Version specifiers follow semver ranges (e.g., `^1.0.0`, `~2.1.0`,
`1.x`, `*`).

---

### 3.5 Lockfile

The lockfile (`axm.lock`) records the resolved state of installed extensions.
Unlike package managers where lockfiles enable reproducible installs, AXM
extensions are checked into source control. The lockfile tracks provenance and
versions for update detection and integrity verification.

#### Schema

```json
{
  "lockfileVersion": 1,
  "extensions": {
    "skills": {
      "@wayne/grappling-hook": {
        "version": "1.2.3",
        "sourceType": "registry",
        "sourceOrigin": "https://registry.agentxm.ai/extensions/@wayne/grappling-hook",
        "checksum": "sha256-abc123..."
      }
    },
    "mcp-servers": {
      "@wayne/batcomputer": {
        "version": "2.0.0",
        "sourceType": "github",
        "sourceOrigin": "https://github.com/wayne-industries/batcomputer",
        "ref": "v2.0.0",
        "checksum": "sha256-def456..."
      }
    },
    "packs": {
      "@wayne/utility-belt": {
        "version": "1.0.0",
        "sourceType": "registry",
        "sourceOrigin": "https://registry.agentxm.ai/extensions/@wayne/utility-belt",
        "checksum": "sha256-ghi789...",
        "dependencies": ["@wayne/grappling-hook", "@wayne/batcomputer"]
      }
    }
  }
}
```

#### Fields

| Field             | Type   | Required | Description                               |
| ----------------- | ------ | -------- | ----------------------------------------- |
| `lockfileVersion` | number | Yes      | Schema version (currently `1`)            |
| `extensions`      | object | Yes      | Map of extension type → name → lock entry |

**Lock entry fields:**

| Field          | Type     | Required | Description                                   |
| -------------- | -------- | -------- | --------------------------------------------- |
| `version`      | string   | Yes      | Resolved semver version                       |
| `sourceType`   | enum     | Yes      | Source type (see Sources table)               |
| `sourceOrigin` | string   | Yes      | Fully resolved source URL or path             |
| `ref`          | string   | No       | Git ref (branch, tag, commit) for git sources |
| `checksum`     | string   | Yes      | Content hash for integrity (`sha256-<hash>`)  |
| `dependencies` | string[] | No       | Fully qualified names of required extensions  |

#### Behavior

- **Generated automatically** — Created/updated by `axm install`, `axm update`,
  and related commands
- **Should be committed** — Check into version control alongside extensions
- **Provenance tracking** — Records where each extension was sourced from
- **Update detection** — Enables `axm outdated` and `axm update` to compare
  installed versions against available versions
- **Integrity verification** — Checksums validate extension contents haven't
  been modified

---

## 4. System Components

### 4.1 Registry API

The AXM Registry is a centralized service for publishing and discovering
extensions.

> **Status:** TBD — API specification to be defined.

#### Planned Capabilities

- Extension publishing and versioning
- Scoped namespaces with ownership
- Search and discovery
- Download statistics and popularity metrics
- Verified publishers

---

### 4.2 Filesystem Registry

A filesystem registry is a directory structure containing extensions, indexed by
an `axm-index.json` manifest. Used for local development, monorepos, and
self-hosted extension collections.

#### Extension Index (axm-index.json)

A manifest describing multiple extensions in a directory structure.

##### Schema

```json
{
  "skills": [
    {
      "name": "@wayne/grappling-hook",
      "description": "Deploy grappling hook for rapid traversal",
      "files": ["SKILL.md", "scripts/helper.py"]
    }
  ],
  "commands": [
    {
      "name": "@wayne/batsignal",
      "description": "Activate the Bat-Signal",
      "command": "batsignal.md"
    }
  ],
  "packs": [],
  "mcp-servers": [],
  "rules": [],
  "agents": []
}
```

##### Entry Fields

Common fields for all entry types:

| Field         | Type     | Required | Description                              |
| ------------- | -------- | -------- | ---------------------------------------- |
| `name`        | string   | Yes      | Fully qualified name (`@<scope>/<name>`) |
| `description` | string   | Yes      | Short description                        |
| `files`       | string[] | No       | Relative paths to extension files        |

Additional fields vary by extension type (see Extension Manifests).

##### Directory Structure

Extensions are located at `<type>/@<scope>/<name>/` relative to the index file:

```
project/
├── axm-index.json
├── skills/
│   └── @wayne/
│       └── grappling-hook/
│           ├── SKILL.md
│           └── scripts/
│               └── deploy.sh
├── commands/
│   └── @wayne/
│       └── batcomputer-sync/
│           └── bin/
│               └── sync.js
└── mcp-servers/
    └── @wayne/
        └── batcave-mcp/
            └── server.py
```

---

### 4.3 CLI

Command-line interface for managing extensions.

#### Design Principles

- **Root-level commands for common operations** — Commands equivalent across
  extension types (where type can be inferred from input) are available at the
  root level. This makes the CLI familiar for users coming from npm and package
  managers that deal with a single artifact type.
- **Extension-specific subcommands** — Every extension type gets its own command
  with subcommands. Everything you can do with an extension type is available at
  the subcommand level. Root-level commands are aliases/helpers.
- **Benefits of subcommand structure:**
  - More specific help and description text at the subcommand level
  - More readable commands that communicate intent
  - Custom subcommands unique to each extension type

#### Command Structure

```
axm <command> [target] [flags]
```

#### Example Usage

```bash
# install a skill from axm registry
axm install @wayne-industries/grappling-hook

# install skills from a github repo
axm install mygithuborg/some-skills
# or
axm skills install mygithuborg/some-skills

# create extension pack
axm packs new @wayne-industries/utility-belt

# add extension to pack
axm packs add @wayne-industries/utility-belt @wayne-industries/grappling-hook
# or
axm packs add utility-belt grappling-hook

# publish an extension
axm publish @wayne-industries/utility-belt

# update extensions
axm update

# update extensions for scope
axm update @wayne-industries

# fork an extension into axm (works with axm or non-axm sources like Claude Code)
axm fork ./.claude/skills/some-skill [name]
```

---

#### Workspace

Commands for managing the AXM workspace.

##### init

Initialize a new AXM workspace.

```bash
axm init
```

Creates the `.axm/` directory structure in the current project.

##### doctor

Diagnose workspace issues.

```bash
axm doctor
```

Checks for common problems: invalid manifests, missing dependencies, outdated
extensions.

##### settings

Manage workspace settings.

```bash
axm settings                     # open/list settings
axm settings get <key>           # get a setting value
axm settings set <key> <value>   # set a setting value
```

---

#### Authentication

Commands for registry authentication.

##### login

Authenticate with the AXM registry.

```bash
axm login
```

##### logout

Clear stored credentials.

```bash
axm logout
```

##### whoami

Display current authenticated user.

```bash
axm whoami
```

---

#### Extension Management

Common operations on any extension type. The extension type is inferred from the
input or context.

##### list

List all installed extensions.

```bash
axm list
```

##### install

Install an extension by identifier.

```bash
axm install <ext>
```

##### fork

Fork an extension for customization.

```bash
axm fork <ext> [name]
```

##### uninstall

Remove an installed extension.

```bash
axm uninstall <ext>
```

##### update

Update one or all extensions.

```bash
axm update [ext]
```

##### outdated

List extensions with available updates.

```bash
axm outdated
```

##### enable

Enable a disabled extension.

```bash
axm enable <ext>
```

##### disable

Disable an extension without uninstalling.

```bash
axm disable <ext>
```

##### info

Show extension details.

```bash
axm info <ext>
```

##### validate

Validate extension configuration.

```bash
axm validate [ext]
```

##### prune

Remove unmanaged extensions.

```bash
axm prune [ext] [--all]
```

##### import

Import unmanaged extensions into AXM.

```bash
axm import [ext] [--all] [--agent]
```

---

#### Skills

Commands for managing skills (context-triggered or invoked agent instructions).

##### skills list

List installed skills.

```bash
axm skills list
```

##### skills new

Scaffold a new skill.

```bash
axm skills new <name>
```

##### skills fork

Copy an existing skill to customize.

```bash
axm skills fork <skill> [name]
```

##### skills install

Install a skill from registry or source.

```bash
axm skills install <skill>
```

**Flags**:

- `--global`: Install to `~/.axm/` (user-wide) instead of `.axm/`
  (project-local)
- `--agent <name>`: Target specific agents (e.g., `claude-code`, `cursor`)
- `--skill <name>`: Install only specific skills by name
- `--all`: Install all discovered skills
- `--yes/-y`: Skip confirmation prompts
- `--list/-l`: List available skills without installing

**Installation flow**:

1. **Ensure initialization** — Create `.axm/` directory structure if needed
2. **Resolve extension** — Use extension resolution (§3.2) with
   `types: [skill]`, configured agents, and configured sources (all by default)
3. **Handle results**:
   - None → error: "skill not found"
   - One → proceed to install
   - Multiple (interactive) → prompt user to select
4. **Install skill** — Copy to canonical location (`.axm/skills/<name>/`), sync
   to configured agents (symlink preferred, falls back to copy)
5. **Update lockfile** — Record resolved version, provenance, checksum in
   `axm.lock`
6. **Update settings** — Add extension with version specifier to `settings.json`

**Directory structure after installation**:

```
.axm/
├── settings.json           # Lists installed skills with their source
├── axm.lock                # Resolved state: commit SHA, content hashes, timestamps
└── skills/
    └── my-skill/           # Canonical skill location
        ├── SKILL.md        # Main instructions (required)
        ├── examples/       # Example outputs (optional)
        │   └── sample.md
        └── scripts/        # Scripts skill can execute (optional)
            └── helper.sh

~/.claude/skills/
└── my-skill -> ../../../.axm/skills/my-skill  # Agent symlink
```

##### skills uninstall

Remove a skill.

```bash
axm skills uninstall <skill>
```

##### skills update

Update one or all skills.

```bash
axm skills update [skill]
```

##### skills enable

Enable a disabled skill.

```bash
axm skills enable <skill>
```

##### skills disable

Disable a skill without uninstalling.

```bash
axm skills disable <skill>
```

##### skills publish

Publish a skill to the registry.

```bash
axm skills publish
```

##### skills unpublish

Remove a skill from the registry.

```bash
axm skills unpublish <skill>
```

##### skills validate

Validate skill configuration.

```bash
axm skills validate [skill]
```

---

#### MCP Servers

Commands for managing MCP (Model Context Protocol) server integrations.

##### mcps list

List configured MCP servers.

```bash
axm mcps list
```

##### mcps new

Scaffold a new MCP server wrapper.

```bash
axm mcps new <name>
```

##### mcps fork

Copy an existing server to customize.

```bash
axm mcps fork <server> [name]
```

##### mcps install

Install an MCP server from registry or source.

```bash
axm mcps install <server>
```

##### mcps uninstall

Remove an MCP server.

```bash
axm mcps uninstall <server>
```

##### mcps update

Update one or all MCP servers.

```bash
axm mcps update [server]
```

##### mcps enable

Enable a disabled MCP server.

```bash
axm mcps enable <server>
```

##### mcps disable

Disable an MCP server without uninstalling.

```bash
axm mcps disable <server>
```

##### mcps publish

Publish an MCP server to the registry.

```bash
axm mcps publish
```

##### mcps validate

Validate MCP server configuration.

```bash
axm mcps validate [server]
```

---

#### Packs

Commands for managing packs (bundles of extensions).

##### packs list

List installed packs.

```bash
axm packs list
```

##### packs new

Scaffold a new pack.

```bash
axm packs new <name>
```

##### packs fork

Copy an existing pack to customize.

```bash
axm packs fork <pack> [name]
```

##### packs install

Install a pack (installs all contained extensions).

```bash
axm packs install <pack>
```

##### packs uninstall

Remove a pack.

```bash
axm packs uninstall <pack>
```

##### packs update

Update one or all packs.

```bash
axm packs update [pack]
```

##### packs enable

Enable a disabled pack.

```bash
axm packs enable <pack>
```

##### packs disable

Disable a pack without uninstalling.

```bash
axm packs disable <pack>
```

##### packs publish

Publish a pack to the registry.

```bash
axm packs publish
```

##### packs add

Add an extension to a pack.

```bash
axm packs add <pack> <ext>
```

##### packs remove

Remove an extension from a pack.

```bash
axm packs remove <pack> <ext>
```

##### packs validate

Validate pack configuration.

```bash
axm packs validate [pack]
```

---

#### Rules

Commands for managing rules (instructions that shape AI behavior).

> **Status:** MVP?

##### rules list

List installed rules.

```bash
axm rules list
```

##### rules new

Scaffold a new rule.

```bash
axm rules new <name>
```

##### rules fork

Copy an existing rule to customize.

```bash
axm rules fork <rule> [name]
```

##### rules install

Install a rule from registry or source.

```bash
axm rules install <rule>
```

##### rules uninstall

Remove a rule.

```bash
axm rules uninstall <rule>
```

##### rules update

Update one or all rules.

```bash
axm rules update [rule]
```

##### rules enable

Enable a disabled rule.

```bash
axm rules enable <rule>
```

##### rules disable

Disable a rule without uninstalling.

```bash
axm rules disable <rule>
```

##### rules publish

Publish a rule to the registry.

```bash
axm rules publish
```

##### rules validate

Validate rule configuration.

```bash
axm rules validate [rule]
```

---

#### Agents

Commands for managing agents (sub-agents for specialized tasks).

> **Status:** MVP?

##### agents list

List installed agents.

```bash
axm agents list
```

##### agents new

Scaffold a new agent.

```bash
axm agents new <name>
```

##### agents fork

Copy an existing agent to customize.

```bash
axm agents fork <agent> [name]
```

##### agents install

Install an agent from registry or source.

```bash
axm agents install <agent>
```

##### agents uninstall

Remove an agent.

```bash
axm agents uninstall <agent>
```

##### agents update

Update one or all agents.

```bash
axm agents update [agent]
```

##### agents enable

Enable a disabled agent.

```bash
axm agents enable <agent>
```

##### agents disable

Disable an agent without uninstalling.

```bash
axm agents disable <agent>
```

##### agents publish

Publish an agent to the registry.

```bash
axm agents publish
```

##### agents validate

Validate agent configuration.

```bash
axm agents validate [agent]
```

---

## 5. Open Questions

- `import` vs `fork`: — which term better communicates the action?
- External install behavior: `source-external` | `fork` | `ask`?
- Init behavior when non-AXM extensions exist: `fork` | `ask`?
- Rename command — should there be an explicit rename operation?
- What about moving (or copying) an extension to/from user/project level?
- Naming conflict during install — what happens if skill name already exists?
  - Error by default, require `--force` to overwrite
  - Version comparison if same source, offer upgrade path
  - Prompt for alternative name

---

## 6. Future Work

### Discovery

Browse and search the extension registry.

```bash
axm search <query>               # search all extension types
axm browse                       # interactive registry browser
axm featured                     # show featured extensions
axm trending                     # show trending extensions
```

### Additional Considerations

- Vendor-specific extension file formats
- Extension verification and signing
- Private registries
- Team/organization features
- Usage analytics

### Implementation Improvements

- **Shallow clones**: Use `--depth 1` for git clones to reduce bandwidth and
  speed up installation (current implementation does full clones)
- **Temp/discard strategy**: Clone to temp directory, copy skills to canonical
  location, then discard the clone—rather than caching clones in
  `.axm/cache/git/`. This simplifies cache management and avoids stale repos.

---
