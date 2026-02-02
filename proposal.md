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
  servers)
- Support for multiple sources (registry, GitHub, GitLab, local filesystem)
- Familiar CLI experience for users of npm/pnpm/cargo
- Extension provenance and version tracking for updates
- Progressive disclosure: simple commands for common tasks, full control when
  needed

### 1.2 Non-Goals

- Runtime execution of extensions (handled by host agents)
- Extension sandboxing or security isolation
- Paid extension marketplace (future consideration)
- Verbosity flags (`--verbose`, `-v`, `--quiet`) — use standard output levels

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
| **Fork**           | Create a named universal extension from an existing extension                               |

### Extension Types

| Term           | Definition                                                                         |
| -------------- | ---------------------------------------------------------------------------------- |
| **Skill**      | Markdown instructions that guide agent behavior for specific tasks (see below)     |
| **Command**    | User-invokable prompts that perform specific actions (distinct from CLI commands)  |
| **Pack**       | A bundle of extensions distributed together for a specific purpose or workflow     |
| **MCP Server** | A Model Context Protocol server providing tools, resources, or context (see below) |

**Skill** — Context-triggered or explicitly invoked instructions written in markdown
that guide agent behavior for specific tasks. Skills can include examples, scripts,
and supporting files. See [Agent Skills](https://agentskills.io/home) and
[Claude Code Skills](https://code.claude.com/docs/en/skills).

**Command** — User-invokable prompts that perform specific actions when explicitly
triggered (e.g., via slash commands like `/commit`). Unlike skills which can be
context-triggered, commands are always explicitly invoked by the user. See
[Gemini CLI Commands](https://geminicli.com/docs/cli/custom-commands/),
[Claude Code Slash Commands](https://web.archive.org/web/20260110152000/https://code.claude.com/docs/en/slash-commands),
[OpenCode Commands](https://opencode.ai/docs/commands/),
[VS Code Prompt Files](https://code.visualstudio.com/docs/copilot/customization/prompt-files),
and [Codex CLI Slash Commands](https://developers.openai.com/codex/cli/slash-commands/).

**Pack** — A curated bundle of extensions (skills, commands, MCP servers, or other
packs) distributed together. Packs simplify installation of related extensions for
specific workflows, teams, or use cases.

**MCP Server** — A server implementing the Model Context Protocol that provides
tools, resources, or context to AI agents. MCP servers enable agents to interact
with external systems, APIs, and data sources. See
[Model Context Protocol](https://modelcontextprotocol.io/).

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

User-invokable agent prompts. Note: "command" here refers to the extension type
(agent prompts), not CLI commands documented in §4.3.

```json
{
  "name": "@wayne/batcomputer-sync",
  "version": "1.0.0",
  "description": "Sync data with the Batcomputer"
}
```

#### axm-pack.json

Bundle of extensions. References extensions by fully qualified name. Packs can
include other packs, enabling transitive dependencies.

When multiple extensions or packs specify overlapping dependencies with different
version constraints, the highest compatible version is used and a warning is
displayed.

```json
{
  "name": "@wayne/utility-belt",
  "version": "1.0.0",
  "description": "Complete crime-fighting toolkit",
  "skills": ["@wayne/grappling-hook"],
  "mcp-servers": ["@wayne/batcomputer"],
  "packs": ["@wayne/base-toolkit"],
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
`packs`, `mcp-servers`. If `types` is provided, only search matching type
directories.

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
| `type`          | enum    | `skill`, `command`, `pack`, `mcp-server`                                         |
| `source`        | enum    | `github`, `gitlab`, `bitbucket`, `azuredevops`, `git`, `url`, `path`, `registry` |
| `origin`        | string  | Fully resolved value (URL, path, or registry identifier)                         |
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
| `checksum`     | string   | Content hash for integrity verification       |
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
| `registry`    | AXM extension registry    | Filesystem path or remote URL                             | `@<scope>/<name>`                   |

**Registry sources:**

- **Filesystem registry**: `origin` is a local path to a directory with
  `axm-index.json` (see §4.1)
- **Remote registry**: `origin` is a URL (e.g.,
  `https://registry.agentxm.ai/extensions/<scope>/<name>`)

---

### 3.4 Settings

Settings are configured at the project level (`.axm/settings.json`).

```jsonc
{
  // Project default scope. Falls back to logged-in user's scope, or @community if not logged in.
  "scope": "@myorg",
  "sources": {
    "github": { "url": "https://github.com" },
    "gitlab": { "url": "https://gitlab.com" },
    "bitbucket": { "url": "https://bitbucket.org" },
    "azuredevops": { "url": "https://dev.azure.com" },
    "registry": { "path": "~/extensions" },
  },
  "agents": {
    "claude-code": {},
    "cursor": {},
    "codex": {
      "skills": { "path": "~/.codex/skills" },
    },
  },
  "extensions": {
    "skills": {
      "@wayne/grappling-hook": "^1.0.0",
    },
    "commands": {
      "@wayne/batcomputer-sync": "^1.0.0",
    },
    "packs": {
      "@wayne/utility-belt": "^1.0.0",
    },
    "mcp-servers": {
      "@wayne/batcomputer": "^2.0.0",
    },
  },
}
```

#### Fields

| Field        | Type   | Description                                                        |
| ------------ | ------ | ------------------------------------------------------------------ |
| `sources`    | object | Source configuration (see Source Configuration below)              |
| `agents`     | object | Agent configuration (see Agent Configuration below)                |
| `scope`      | string | Default scope for resolving and publishing (default: `@community`) |
| `extensions` | object | Desired extensions by type (similar to npm dependencies)           |

The `extensions` field maps extension type to a dictionary of name → version
specifier. Version specifiers follow semver ranges (e.g., `^1.0.0`, `~2.1.0`,
`1.x`, `*`).

#### Source Configuration

The `sources` object maps source type to its configuration. All sources have
sensible defaults; omit `sources` entirely to use defaults.

```json
{
  "sources": {
    "<source-type>": { <source-type-configuration> }
  }
}
```

**Source type configurations:**

| Source Type   | Fields          | Default                              |
| ------------- | --------------- | ------------------------------------ |
| `github`      | `url`: string   | `{ "url": "https://github.com" }`    |
| `gitlab`      | `url`: string   | `{ "url": "https://gitlab.com" }`    |
| `bitbucket`   | `url`: string   | `{ "url": "https://bitbucket.org" }` |
| `azuredevops` | `url`: string   | `{ "url": "https://dev.azure.com" }` |
| `git`         | (none)          | `{}`                                 |
| `registry`    | `url` or `path` | (none)                               |

**Disabling a source:**

Set a source to `false` to disable it:

```json
{
  "sources": {
    "bitbucket": false,
    "azuredevops": false
  }
}
```

**Enterprise/self-hosted instances:**

Override the URL for self-hosted Git platforms:

```json
{
  "sources": {
    "github": { "url": "https://github.acme.corp" },
    "gitlab": { "url": "https://gitlab.internal.io" }
  }
}
```

**Multiple registries:**

Use an array for multiple registry sources (checked in order):

```json
{
  "sources": {
    "registry": [
      { "path": "./.axm/registry" },
      { "url": "https://registry.acme.corp" },
      { "url": "https://registry.agentxm.ai" }
    ]
  }
}
```

#### Agent Configuration

The `agents` object maps agent identifier to its configuration. Agents are
auto-detected by default; specify `agents` to limit which agents receive
extensions or to customize paths.

```json
{
  "agents": {
    "<agent-id>": { <agent-configuration> }
  }
}
```

**Supported agents:**

| Agent ID      | Name           | Default Skills Path          |
| ------------- | -------------- | ---------------------------- |
| `claude-code` | Claude Code    | `.claude/skills` (project)   |
| `cursor`      | Cursor         | `.cursor/skills` (project)   |
| `windsurf`    | Windsurf       | `.windsurf/skills` (project) |
| `codex`       | Codex CLI      | `.codex/skills` (project)    |
| `copilot`     | GitHub Copilot | `.github/skills` (project)   |
| `gemini`      | Gemini CLI     | `.gemini/skills` (project)   |
| `vscode`      | VS Code        | `.vscode/skills` (project)   |
| `opencode`    | OpenCode       | `.opencode/skills` (project) |

**Agent configuration structure:**

Each agent can configure settings per extension type:

```json
{
  "agents": {
    "<agent-id>": {
      "skills": { "path": "..." },
      "commands": { "path": "..." },
      "packs": { "path": "..." },
      "mcp-servers": { "path": "..." }
    }
  }
}
```

**Extension type fields:**

| Field  | Type   | Description                             |
| ------ | ------ | --------------------------------------- |
| `path` | string | Override the default directory for type |

**Disabling an agent:**

Set an agent to `false` to exclude it from extension sync:

```json
{
  "agents": {
    "cursor": false,
    "windsurf": false
  }
}
```

**Custom paths:**

Override default paths for agents with non-standard configurations:

```json
{
  "agents": {
    "codex": {
      "skills": { "path": "~/.codex/extensions/skills" }
    },
    "claude-code": {
      "skills": { "path": "/shared/team-skills" }
    }
  }
}
```

**Auto-detection behavior:**

- If `agents` is omitted, AXM auto-detects installed agents
- If `agents` is specified, only listed agents are used (no auto-detection)
- Use `{}` for an agent to use default configuration

---

### 3.5 Lockfile

The lockfile (`axm.lock`) records the resolved state of installed extensions.
Unlike package managers where lockfiles enable reproducible installs, AXM
extensions are checked into source control. The lockfile tracks provenance and
versions for update detection.

#### Schema

```json
{
  "lockfileVersion": 1,
  "extensions": {
    "skills": {
      "@wayne/grappling-hook": {
        "source": "github:wayne-industries/skills",
        "origin": "https://github.com/wayne-industries/skills",
        "path": "skills/grappling-hook",
        "ref": "main",
        "folderHash": "abc123def456...",
        "installedAt": "2025-01-15T10:30:00Z",
        "updatedAt": "2025-01-15T10:30:00Z"
      }
    },
    "commands": {
      "@wayne/batcomputer-sync": {
        "source": "github:wayne-industries/commands",
        "origin": "https://github.com/wayne-industries/commands",
        "path": "commands/batcomputer-sync",
        "ref": "main",
        "folderHash": "def456ghi789...",
        "installedAt": "2025-01-15T10:30:00Z",
        "updatedAt": "2025-01-15T10:30:00Z"
      }
    },
    "mcp-servers": {
      "@wayne/batcomputer": {
        "source": "github:wayne-industries/batcomputer",
        "origin": "https://github.com/wayne-industries/batcomputer",
        "ref": "v2.0.0",
        "folderHash": "789ghi012jkl...",
        "installedAt": "2025-01-15T10:30:00Z",
        "updatedAt": "2025-01-15T10:30:00Z"
      }
    },
    "packs": {
      "@wayne/utility-belt": {
        "source": "registry:@wayne/utility-belt",
        "origin": "https://registry.agentxm.ai/extensions/@wayne/utility-belt",
        "version": "1.0.0",
        "folderHash": "mno345pqr678...",
        "dependencies": ["@wayne/grappling-hook", "@wayne/batcomputer"],
        "installedAt": "2025-01-15T10:30:00Z",
        "updatedAt": "2025-01-15T10:30:00Z"
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

| Field          | Type     | Required | Description                                                  |
| -------------- | -------- | -------- | ------------------------------------------------------------ |
| `source`       | string   | Yes      | Normalized source identifier (e.g., `github:owner/repo`)     |
| `origin`       | string   | Yes      | Fully resolved source URL or path                            |
| `path`         | string   | No       | Subpath within source repository (for multi-extension repos) |
| `ref`          | string   | No       | Git ref (branch, tag, commit) for git sources                |
| `version`      | string   | No       | Semver version (registry sources only)                       |
| `folderHash`   | string   | Yes      | Git tree SHA or content hash for the extension folder        |
| `dependencies` | string[] | No       | Fully qualified names of required extensions                 |
| `installedAt`  | string   | Yes      | ISO 8601 timestamp of initial installation                   |
| `updatedAt`    | string   | Yes      | ISO 8601 timestamp of last update                            |

#### Version Tracking

For git-based sources, versioning uses **folder hashes** rather than semver:

- **folderHash**: Git tree SHA that uniquely identifies the extension folder
  contents
- Obtained via GitHub/GitLab Trees API without cloning
- Changes when any file in the extension folder is modified
- More stable than commit SHAs (survives rebases)
- Enables efficient update detection: compare local hash vs remote hash

For registry sources, both `version` (semver) and `folderHash` are tracked.

#### Update Detection

To check for updates without cloning:

1. Read `source` and `path` from lockfile entry
2. Fetch remote folder hash via platform API:
   - **GitHub**: `GET /repos/{owner}/{repo}/git/trees/{ref}?recursive=1`, find
     entry where `path` matches and `type === 'tree'`, return `sha`
   - **GitLab**: Similar approach via GitLab Trees API
   - **Filesystem registry**: Compute hash from directory contents
3. Compare remote hash to local `folderHash`
4. If different, update is available

The `axm outdated` command performs this check for all installed extensions. The
`axm update` command re-runs installation for extensions with available updates.

#### Behavior

- **Generated automatically** — Created/updated by `axm install`, `axm update`,
  and related commands
- **Should be committed** — Check into version control alongside extensions
- **Provenance tracking** — Records where each extension was sourced from
- **Update detection** — Enables `axm outdated` and `axm update` to compare
  installed `folderHash` against remote

---

## 4. System Components

### 4.1 Filesystem Registry

A filesystem registry is a directory structure containing extensions, indexed by
an `axm-index.json` manifest. Used for local development, monorepos, and
self-hosted extension collections. This is the MVP registry implementation.

When resolving `@<scope>/<name>`, the filesystem registry is checked at project
level (`.axm/`) and user level (`~/.axm/`) before any remote registry.

> **Note:** Within a single registry, the fully qualified name (`@<scope>/<name>`)
> must be unique across all extension types. For example, you cannot have both a
> skill and a command named `@wayne/grappling-hook` in the same registry.

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
  "mcp-servers": []
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

### 4.2 Remote Registry API

The AXM Registry is a centralized service for publishing and discovering
extensions.

> **Status:** Future — API specification to be defined.

#### Planned Capabilities

- Extension publishing and versioning
- Scoped namespaces with ownership
- Search and discovery
- Download statistics and popularity metrics
- Verified publishers

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

#### Global Flags

| Flag        | Description                                         |
| ----------- | --------------------------------------------------- |
| `--dry-run` | Preview changes without writing to disk or fetching |
| `--yes`     | Skip confirmation prompts (for scripting)           |
| `--help`    | Show help for command                               |
| `--version` | Show AXM version                                    |

> **Note:** The `--yes` flag enables non-interactive mode for scripting. CI/CD
> pipelines are not a primary use case—extensions should be committed to source
> control and available without runtime installation.

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

**Flags:**

- `--registry <path|url>`: Configure a registry source. If a local path is
  provided and no registry exists at that location, prompts to create one.

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
4. **Check conflicts** — If skill name already exists, warn and skip (see Open
   Questions for future behavior)
5. **Fetch source** — Clone to temp directory using shallow clone (`--depth 1`),
   copy skill files to canonical location, then clean up temp directory
6. **Sync to agents** — Create symlinks to agent skill directories; fall back to
   copy when symlinks fail (Windows, cross-filesystem mounts)
7. **Update lockfile** — Record source, origin, folderHash, timestamps in
   `axm.lock`
8. **Update settings** — Add extension entry to `settings.json`

**Caching strategy**:

- Git sources are cloned to a temp directory with `--depth 1` (shallow clone)
- After copying skill files to `.axm/skills/<name>/`, the temp clone is deleted
- No persistent cache of git clones—each install fetches fresh
- Well-known URL sources follow the same pattern: fetch to temp, copy, cleanup

**Symlink behavior**:

- Symlinks are preferred for agent sync (single source of truth)
- Fall back to copy when:
  - Operating system doesn't support symlinks (Windows without admin)
  - Agent directory is on a different filesystem
  - Symlink creation fails for any reason
- Lockfile does not track sync method—it's determined at sync time

**Directory structure after installation**:

```
.axm/
├── settings.json           # Lists installed skills with their source
├── axm.lock                # Resolved state: folderHash, timestamps
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

#### Commands

Commands for managing commands (user-invokable prompts).

##### commands list

List installed commands.

```bash
axm commands list
```

##### commands new

Scaffold a new command.

```bash
axm commands new <name>
```

##### commands fork

Copy an existing command to customize.

```bash
axm commands fork <command> [name]
```

##### commands install

Install a command from registry or source.

```bash
axm commands install <command>
```

##### commands uninstall

Remove a command.

```bash
axm commands uninstall <command>
```

##### commands update

Update one or all commands.

```bash
axm commands update [command]
```

##### commands enable

Enable a disabled command.

```bash
axm commands enable <command>
```

##### commands disable

Disable a command without uninstalling.

```bash
axm commands disable <command>
```

##### commands publish

Publish a command to the registry.

```bash
axm commands publish
```

##### commands unpublish

Remove a command from the registry.

```bash
axm commands unpublish <command>
```

##### commands validate

Validate command configuration.

```bash
axm commands validate [command]
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

##### mcps unpublish

Remove an MCP server from the registry.

```bash
axm mcps unpublish <server>
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

##### packs unpublish

Remove a pack from the registry.

```bash
axm packs unpublish <pack>
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

## 5. Open Questions

### Phase 1: Vertical Slice (`axm skills install`)

1. Skill naming — should skill name come from directory name or SKILL.md
   frontmatter `name` field?
   - Current: directory name
   - Alternative: frontmatter `name` takes precedence if present
2. Naming conflict during install — what happens if skill name already exists?
   - Current: warn and skip
   - Future options: `--force` to overwrite, version comparison if same source,
     prompt for alternative name
3. External install behavior: `source-external` | `fork` | `ask`?
4. Init behavior when non-AXM extensions exist: `fork` | `ask`?
5. Checksum verification — should checksums be verified during install?
6. Extension provenance — how should extension origin be attested/verified?
7. Tampered extensions — what happens when installed extensions don't match their
   expected checksums?

### Phase 2: Complete Skills & Filesystem Registry

1. `import` vs `fork` — which term better communicates the action?
2. Rename command — should there be an explicit rename operation?
3. Rollback mechanism — how should failed updates be handled? Options:
   - Automatic rollback to previous version on failure
   - Manual recovery via `axm restore` command
   - No rollback (user re-installs manually)
4. User-level settings — should `~/.axm/settings.json` be supported for global
   defaults?
5. Environment variable overrides — should settings be configurable via
   environment variables (e.g., `AXM_SCOPE`, `AXM_REGISTRY`)?
6. Moving extensions between levels — what about copying an extension to/from
   user/project level?
7. Doctor/validate conditions — what checks should `axm doctor` perform? The
   `validate` subcommands will be a subset of these. Candidates:
   - Invalid manifests (missing required fields, malformed JSON)
   - Missing dependencies (pack references non-existent extension)
   - Orphaned extensions (in filesystem but not in settings/lockfile)
   - Stale lockfile (extensions modified since last install)
   - Broken symlinks (agent skill directories)
   - Outdated extensions (newer versions available)
8. `axm version` command — should there be a dedicated version command, or is
   `--version` flag sufficient?
9. `--json` flag — is machine-readable JSON output needed for scripting/tooling
   integration?
10. Glob/scope patterns — should commands support patterns like `@wayne/*` or
    `**/*-skill` for bulk operations?

### Phase 3: Commands Capability

(Patterns established in phases 1-2 apply)

### Phase 4: Iterate

1. Additional extension types — should rules (persistent behavior instructions)
   and subagents (delegated task specialists) be supported as extension types?

---

## 6. Implementation Plan

1. **Vertical slice of `axm skills install`** — Implement end-to-end flow
   satisfying this proposal, including initialization, resolution, schemas, and
   agent sync. Goal: establish patterns, approach, and architecture.
2. **Complete skills capability** — Implement remaining skills commands and local
   filesystem registry.
3. **Commands capability** — Implement command extension type.
4. **Iterate** — Experiment and adjust plan/architecture as needed.

---

## 7. Future Work

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

---
