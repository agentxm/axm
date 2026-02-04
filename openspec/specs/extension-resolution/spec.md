# extension-resolution Specification

## Purpose

Resolves input strings to zero or more extension references with metadata. This module is reusable across all extension types and commands.

## ADDED Requirements

### Requirement: Resolution Function

The resolution module SHALL provide a function that accepts an input string and options, returning an array of extension references.

#### Scenario: Resolve with default options

- **WHEN** `resolveExtension("@wayne/grappling-hook")` is called without options
- **THEN** the function returns an Effect containing `ExtensionRef[]`

#### Scenario: Resolve with type filter

- **WHEN** `resolveExtension("@wayne/grappling-hook", { types: ["skill"] })` is called
- **THEN** only skill-type extensions are returned

#### Scenario: Resolve with source filter

- **WHEN** `resolveExtension("owner/repo", { sources: ["github"] })` is called
- **THEN** only GitHub sources are queried (GitLab is skipped)

### Requirement: Input Syntax - Local Path

The resolution module SHALL recognize local filesystem paths and resolve them without network access.

#### Scenario: Relative path with dot-slash

- **WHEN** the input is `./path/to/skills`
- **THEN** the module resolves it as a local path relative to the working directory

#### Scenario: Relative path with parent directory

- **WHEN** the input is `../sibling/skills`
- **THEN** the module resolves it as a local path relative to the working directory

#### Scenario: Absolute POSIX path

- **WHEN** the input is `/home/user/skills`
- **THEN** the module resolves it as an absolute local path

#### Scenario: Absolute Windows path

- **WHEN** the input is `C:\Users\name\skills`
- **THEN** the module resolves it as an absolute local path

### Requirement: Input Syntax - Home Directory Path

The resolution module SHALL recognize home directory paths starting with `~` and expand them to the user's home directory.

#### Scenario: Home directory path with tilde

- **WHEN** the input is `~/skills/my-skill`
- **THEN** the module expands `~` to the user's home directory and resolves as a local path

#### Scenario: Home directory path on Windows

- **WHEN** the input is `~\skills\my-skill` on Windows
- **THEN** the module expands `~` to the user's home directory and resolves as a local path

### Requirement: Input Syntax - AXM Name

The resolution module SHALL recognize fully qualified AXM names in `@scope/name` format.

#### Scenario: Fully qualified AXM name

- **WHEN** the input is `@wayne/grappling-hook`
- **THEN** the module performs AXM name resolution (project → global → registry)

#### Scenario: AXM name with version

- **WHEN** the input is `@wayne/grappling-hook@^1.0.0`
- **THEN** the module resolves the name and includes the version constraint in metadata

### Requirement: Input Syntax - Bare Name

The resolution module SHALL recognize bare names (no `/`) and resolve them using the implied scope from settings.

#### Scenario: Bare name with implied scope configured

- **WHEN** the input is `grappling-hook` and settings has `scope: "@wayne"`
- **THEN** the module resolves `@wayne/grappling-hook` via AXM name resolution

#### Scenario: Bare name without implied scope

- **WHEN** the input is `grappling-hook` and no scope is configured in settings
- **THEN** the module returns an empty array (no match)

### Requirement: Input Syntax - Explicit Source

The resolution module SHALL recognize explicit source prefixes in `source:owner/repo` format.

#### Scenario: GitHub explicit source

- **WHEN** the input is `github:wayne-industries/skills`
- **THEN** the module resolves via GitHub without checking other sources

#### Scenario: GitLab explicit source

- **WHEN** the input is `gitlab:wayne-industries/skills`
- **THEN** the module resolves via GitLab without checking other sources

#### Scenario: Explicit source with path

- **WHEN** the input is `github:wayne-industries/mono/skills/grappling-hook`
- **THEN** the module resolves with `path` set to `skills/grappling-hook`

#### Scenario: Explicit source with ref

- **WHEN** the input is `github:wayne-industries/skills@v1.0.0`
- **THEN** the module resolves with `ref` set to `v1.0.0`

### Requirement: Input Syntax - URL

The resolution module SHALL recognize URLs matching known source patterns.

#### Scenario: GitHub HTTPS URL

- **WHEN** the input is `https://github.com/owner/repo`
- **THEN** the module normalizes to `github:owner/repo` and resolves via GitHub

#### Scenario: GitHub URL with branch and path

- **WHEN** the input is `https://github.com/owner/repo/tree/main/skills`
- **THEN** the module resolves with `ref: "main"` and `path: "skills"`

#### Scenario: GitLab HTTPS URL

- **WHEN** the input is `https://gitlab.com/owner/repo/-/tree/main/skills`
- **THEN** the module resolves via GitLab with appropriate ref and path

#### Scenario: SSH URL

- **WHEN** the input is `git@github.com:owner/repo.git`
- **THEN** the module normalizes to `github:owner/repo` and resolves via GitHub

### Requirement: Input Syntax - Ambiguous Pattern

The resolution module SHALL disambiguate `a/b` patterns that could be AXM names or source shorthand.

#### Scenario: Ambiguous pattern matches local path

- **WHEN** the input is `skills/my-skill` and that path exists on filesystem
- **THEN** the module resolves as a local path

#### Scenario: Ambiguous pattern matches AXM name

- **WHEN** the input is `wayne/grappling-hook` and `@wayne/grappling-hook` exists in `.axm/skills/`
- **THEN** the module resolves as the installed AXM extension

#### Scenario: Ambiguous pattern falls back to GitHub

- **WHEN** the input is `owner/repo` and no local path or AXM name matches
- **THEN** the module queries configured sources (GitHub by default) to resolve

#### Scenario: Ambiguous pattern with multiple source matches

- **WHEN** the input is `owner/repo` and it exists on both GitHub and GitLab
- **THEN** the module returns multiple `ExtensionRef` entries for user selection

### Requirement: Resolution Order

The resolution module SHALL attempt resolution steps in a specific order, stopping at the first match.

#### Scenario: Local path takes precedence

- **WHEN** the input is `./skills` (a local path that exists)
- **THEN** the module returns immediately without checking AXM names or sources

#### Scenario: AXM name takes precedence over ambiguous

- **WHEN** the input is `@wayne/skill` (fully qualified)
- **THEN** the module performs AXM resolution without treating it as ambiguous `a/b`

#### Scenario: Empty result when nothing matches

- **WHEN** the input is `nonexistent/repo` and no resolution step finds a match
- **THEN** the module returns an empty array

### Requirement: AXM Name Resolution Levels

The resolution module SHALL check AXM names at project, global, and registry levels in order.

#### Scenario: Project level match

- **WHEN** resolving `@wayne/skill` and `.axm/skills/@wayne/skill/` exists
- **THEN** the module returns the project-level extension without checking global or registry

#### Scenario: Global level match

- **WHEN** resolving `@wayne/skill` and only `~/.axm/skills/@wayne/skill/` exists
- **THEN** the module returns the global-level extension

#### Scenario: Registry level placeholder

- **WHEN** resolving `@wayne/skill` and it exists only in the remote registry
- **THEN** the module returns the registry extension reference (future: actual lookup)

### Requirement: Path Resolution

The resolution module SHALL scan directories for extension files when given a path.

#### Scenario: Directory with single extension

- **WHEN** the path is a directory containing one `SKILL.md`
- **THEN** the module returns one `ExtensionRef` with type `skill`

#### Scenario: Directory with multiple extensions

- **WHEN** the path is a directory containing multiple `SKILL.md` files in subdirectories
- **THEN** the module returns multiple `ExtensionRef` entries (non-recursive scan)

#### Scenario: File path to manifest

- **WHEN** the path points directly to `axm-skill.json`
- **THEN** the module returns one `ExtensionRef` parsed from the manifest

### Requirement: Type Inference

The resolution module SHALL infer extension type from file patterns.

#### Scenario: Infer skill from SKILL.md

- **WHEN** the resolved path contains `SKILL.md`
- **THEN** the `ExtensionRef.type` is `skill`

#### Scenario: Infer skill from axm-skill.json

- **WHEN** the resolved path contains `axm-skill.json`
- **THEN** the `ExtensionRef.type` is `skill`

#### Scenario: Infer command from axm-command.json

- **WHEN** the resolved path contains `axm-command.json`
- **THEN** the `ExtensionRef.type` is `command`

#### Scenario: Infer mcp-server from axm-mcp-server.json

- **WHEN** the resolved path contains `axm-mcp-server.json`
- **THEN** the `ExtensionRef.type` is `mcp-server`

### Requirement: ExtensionRef Result Schema

The resolution module SHALL return results conforming to the ExtensionRef schema.

#### Scenario: Required fields present

- **WHEN** resolution succeeds
- **THEN** the result contains `type`, `source`, `origin`, `originalInput`, and `metadata`

#### Scenario: Optional fields when applicable

- **WHEN** resolving a git source with ref
- **THEN** the result contains `ref` with the git ref value

#### Scenario: Metadata populated from manifest

- **WHEN** resolving an extension with `axm-skill.json` containing version and description
- **THEN** `metadata.version` and `metadata.description` are populated

### Requirement: Error Handling

The resolution module SHALL return typed errors with recovery guidance.

#### Scenario: Invalid input format

- **WHEN** the input cannot be parsed as any recognized pattern
- **THEN** the module fails with `ResolutionError` code `INVALID_INPUT`

#### Scenario: Network error during source query

- **WHEN** a network request fails while querying a source
- **THEN** the module fails with `ResolutionError` code `NETWORK_ERROR` and includes suggestions
