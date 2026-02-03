# cli-skills-install Specification

## Purpose

The `axm skills install` command installs skills from various sources using extension resolution, state-based architecture, and diff-based operations.

## Requirements

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

- **WHEN** the user runs `axm skills install grappling-hook` and settings has `scope: "@wayne"`
- **THEN** the CLI resolves `@wayne/grappling-hook` and installs

### Requirement: Explicit Source Prefix Support

The CLI SHALL accept explicit source prefix notation.

#### Scenario: GitHub explicit source

- **WHEN** the user runs `axm skills install github:owner/repo`
- **THEN** the CLI resolves via GitHub only (no ambiguity check)

#### Scenario: GitLab explicit source

- **WHEN** the user runs `axm skills install gitlab:owner/repo`
- **THEN** the CLI resolves via GitLab only

### Requirement: Dry-Run Flag

The CLI SHALL support a `--dry-run` flag that previews installation without making changes.

#### Scenario: Dry-run shows plan

- **WHEN** the user runs `axm skills install <source> --dry-run`
- **THEN** the CLI displays the installation plan showing skills to add/update/remove

#### Scenario: Dry-run makes no changes

- **WHEN** the user runs `axm skills install <source> --dry-run`
- **THEN** no files are written, no settings updated, no lockfile modified

#### Scenario: Dry-run with remote source

- **WHEN** the user runs `axm skills install github:owner/repo --dry-run`
- **THEN** the CLI fetches the source to analyze contents and displays "Fetching source to analyze contents..."

#### Scenario: Dry-run exit message

- **WHEN** dry-run completes
- **THEN** the CLI displays "Dry-run complete. No changes made."

### Requirement: JSON Output Flag

The CLI SHALL support a `--json` flag for machine-readable output.

#### Scenario: JSON plan output

- **WHEN** the user runs `axm skills install <source> --dry-run --json`
- **THEN** the CLI outputs the plan as JSON with skills changes array and summary

#### Scenario: JSON format structure

- **WHEN** outputting JSON plan
- **THEN** each change includes `_tag` (Add/Update/Remove), `name`, and type-specific fields

#### Scenario: JSON with real install

- **WHEN** the user runs `axm skills install <source> --json --yes`
- **THEN** the CLI outputs the result as JSON after installation completes

### Requirement: Plan Display

The CLI SHALL display the installation plan before applying changes.

#### Scenario: Plan format

- **WHEN** displaying the installation plan
- **THEN** the CLI shows symbols: `+` for add, `~` for update, `!` for repair, `-` for remove

#### Scenario: Plan summary

- **WHEN** displaying the installation plan
- **THEN** the CLI shows summary: "N to add, N to update, N to repair, N to remove"

#### Scenario: Unchanged skills hidden

- **WHEN** displaying the installation plan
- **THEN** unchanged skills are not shown (only changes displayed)

#### Scenario: Source shown for adds

- **WHEN** displaying an Add change
- **THEN** the skill source is shown (e.g., `github:org/skills@v1.0.0`)

#### Scenario: Hash preview for updates

- **WHEN** displaying an Update change
- **THEN** short hashes are shown (first 7 chars): `abc1234 → def5678`

### Requirement: State-Based Installation

The CLI SHALL use state-based architecture for installation.

#### Scenario: Load current state

- **WHEN** starting installation
- **THEN** the CLI loads actual state from disk and locked state from lockfile

#### Scenario: Build ideal state

- **WHEN** processing install request
- **THEN** the CLI builds ideal state from the resolved source

#### Scenario: Compute diff

- **WHEN** current and ideal states are ready
- **THEN** the CLI computes the diff (plan) between them

#### Scenario: No changes needed

- **WHEN** diff shows no changes
- **THEN** the CLI displays "Already up to date." and exits

#### Scenario: Confirm before apply

- **WHEN** changes are needed and `--yes` not provided
- **THEN** the CLI prompts "Apply changes?" before proceeding

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
