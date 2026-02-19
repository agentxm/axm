# cli-skills-install Specification (Delta)

## Purpose

Updates to the `axm skills install` command to use the extension-resolution module and align with proposal schemas.

## ADDED Requirements

### Requirement: Extension Resolution Integration

The CLI SHALL delegate source resolution to the extension-resolution module.

#### Scenario: Resolution with skill type filter

- **WHEN** the user runs `axm skills install <source>`
- **THEN** the CLI calls `resolveExtension(source, { types: ["skill"] })`

#### Scenario: Resolution returns multiple results

- **WHEN** resolution returns multiple `ExtensionRef` entries
- **THEN** the CLI prompts the user to select which skills to install

#### Scenario: Resolution returns no results

- **WHEN** resolution returns an empty array
- **THEN** the CLI displays "No skills found" error with suggestions

### Requirement: Conflict Detection

The CLI SHALL detect when a skill name already exists and handle conflicts.

#### Scenario: Skill already installed - default behavior

- **WHEN** installing a skill and a skill with the same name already exists in `.axm/skills/`
- **THEN** the CLI displays a warning and skips the skill

#### Scenario: Skill already installed - force flag

- **WHEN** installing with `--force` and a skill with the same name exists
- **THEN** the CLI overwrites the existing skill

### Requirement: AXM Name Input Support

The CLI SHALL accept AXM name patterns as input.

#### Scenario: Fully qualified AXM name

- **WHEN** the user runs `axm skills install @wayne/grappling-hook`
- **THEN** the CLI resolves via AXM name resolution and installs from the matched source

#### Scenario: Bare name with configured scope

- **WHEN** the user runs `axm skills install grappling-hook` and settings has `namespace: "@wayne"`
- **THEN** the CLI resolves `@wayne/grappling-hook` and installs

### Requirement: Explicit Source Prefix Support

The CLI SHALL accept explicit source prefix notation.

#### Scenario: GitHub explicit source

- **WHEN** the user runs `axm skills install github:owner/repo`
- **THEN** the CLI resolves via GitHub only (no ambiguity check)

#### Scenario: GitLab explicit source

- **WHEN** the user runs `axm skills install gitlab:owner/repo`
- **THEN** the CLI resolves via GitLab only

## MODIFIED Requirements

### Requirement: Settings Persistence

The CLI SHALL persist installed skills in `.axm/settings.json` using the extensions structure.

#### Scenario: Settings file creation

- **WHEN** skills are installed for the first time
- **THEN** the CLI creates `.axm/settings.json` with `scope`, `agents`, and `extensions.skills` fields

#### Scenario: Track installed skills in settings

- **WHEN** a skill is installed
- **THEN** the CLI records the skill in `extensions.skills` as a name-to-version mapping

#### Scenario: Settings file format

- **WHEN** viewing the settings file
- **THEN** it contains `scope` (string), `agents` (array), and `extensions` object with `skills` sub-object

#### Scenario: Version specifier in settings

- **WHEN** a skill is installed from a versioned source
- **THEN** the version specifier (e.g., `"^1.0.0"`) is stored, or `"*"` for unversioned sources

### Requirement: Lockfile Management

The CLI SHALL maintain a JSON lockfile tracking resolved versions for reproducibility.

#### Scenario: Lockfile creation

- **WHEN** skills are installed
- **THEN** the CLI creates or updates `.axm/axm.lock` in JSON format

#### Scenario: Lockfile format

- **WHEN** viewing the lockfile
- **THEN** it contains `lockfileVersion` (number) and `extensions` object with `skills` sub-object

#### Scenario: Lock entry fields

- **WHEN** a skill is recorded in the lockfile
- **THEN** the entry contains `source`, `origin`, `folderHash`, `installedAt`, and `updatedAt`

#### Scenario: Folder hash for git sources

- **WHEN** a skill is installed from a git source
- **THEN** the `folderHash` is the git tree SHA of the skill directory

#### Scenario: Folder hash for local sources

- **WHEN** a skill is installed from a local path
- **THEN** the `folderHash` is a SHA-256 hash of the directory contents

### Requirement: Canonical Source Notation

The CLI SHALL normalize all source inputs to canonical notation for storage.

#### Scenario: GitHub shorthand normalized

- **WHEN** the user provides `owner/repo` as input
- **THEN** it is stored as `github:owner/repo` in both settings and lockfile

#### Scenario: GitHub URL normalized

- **WHEN** the user provides `https://github.com/owner/repo`
- **THEN** it is stored as `github:owner/repo`

#### Scenario: AXM name stored as-is

- **WHEN** the user provides `@wayne/grappling-hook`
- **THEN** it is stored as `@wayne/grappling-hook` (registry source implied)

#### Scenario: Local path stored as-is

- **WHEN** the user provides `./path/to/skills`
- **THEN** it is stored as `./path/to/skills`

## REMOVED Requirements

### Requirement: YAML Lockfile Format

**Reason**: Replaced by JSON format for consistency with settings and proposal alignment.

**Migration**: Delete existing `axm.lock` file and reinstall skills. The new JSON lockfile will be created automatically.

### Requirement: commitSha and contentHash Fields

**Reason**: Replaced by single `folderHash` field which uses git tree SHA (more stable across rebases) or content hash for non-git sources.

**Migration**: Delete existing `axm.lock` file and reinstall skills.

### Requirement: Per-skill agents in Settings

**Reason**: Agent selection is now a global setting, not per-skill. The `extensions.skills` mapping stores version specifiers only.

**Migration**: Agent preferences are now stored at the top-level `agents` array in settings.
