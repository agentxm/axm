## ADDED Requirements

### Requirement: Rename updates source, settings, lockfile, and re-renders

`axm subagents rename` SHALL rename the canonical source directory, update `subagent.json` and `SUBAGENT.md` frontmatter `name` field, remove old rendered files, render new ones with the new name, and update settings and lockfile entries.

#### Scenario: Full rename flow

- **WHEN** user runs `axm subagents rename old-reviewer new-reviewer`
- **AND** `old-reviewer` is installed with rendered files for `["claude-code", "cursor"]`
- **THEN** the CLI SHALL rename `.axm/extensions/@acme/subagents/old-reviewer/` to `.axm/extensions/@acme/subagents/new-reviewer/`
- **AND** SHALL update `name` in `subagent.json` and SUBAGENT.md frontmatter
- **AND** SHALL delete `.claude/agents/old-reviewer.md` and `.cursor/agents/old-reviewer.md`
- **AND** SHALL render `.claude/agents/new-reviewer.md` and `.cursor/agents/new-reviewer.md`
- **AND** SHALL update the settings and lockfile entries

#### Scenario: Roo Code mode renamed

- **WHEN** Roo Code is configured
- **AND** user runs `axm subagents rename old-reviewer new-reviewer`
- **THEN** the `old-reviewer` mode entry SHALL be removed from `.roomodes`
- **AND** a `new-reviewer` mode entry SHALL be added

### Requirement: Name validation

The new name SHALL follow the same format as `axm subagents new`: `[a-z0-9][a-z0-9-]*`, max 64 characters.

#### Scenario: Invalid new name rejected

- **WHEN** user runs `axm subagents rename old-name New_Name`
- **THEN** the CLI SHALL fail with a name format error

### Requirement: Name collision detection

Renaming to a name that matches an existing subagent SHALL require `--force`.

#### Scenario: New name collision

- **WHEN** user runs `axm subagents rename old-name existing-name`
- **AND** `existing-name` is already installed
- **THEN** the CLI SHALL fail with a conflict error suggesting `--force`

#### Scenario: Force overrides collision

- **WHEN** user runs `axm subagents rename old-name existing-name --force`
- **THEN** the CLI SHALL replace the existing subagent

### Requirement: Registry and pack-installed subagents cannot be renamed

Renaming SHALL be restricted to locally-authored subagents (those without a registry or pack origin in the lockfile). Attempting to rename a registry-installed or pack-installed subagent SHALL fail with an error explaining that rename would sever the upstream update link.

#### Scenario: Registry-installed subagent rename rejected

- **WHEN** user runs `axm subagents rename code-reviewer new-name`
- **AND** `code-reviewer` was installed from a registry (`type: "registry"` in lockfile)
- **THEN** the CLI SHALL fail with an error: `Cannot rename registry-installed subagent "code-reviewer". Rename severs the upstream update link. Use a local fork if you need a different name.`

#### Scenario: Pack-installed subagent rename rejected

- **WHEN** user runs `axm subagents rename code-reviewer new-name`
- **AND** `code-reviewer` was installed as part of a pack
- **THEN** the CLI SHALL fail with an error indicating the subagent is pack-managed

#### Scenario: Locally-authored subagent rename succeeds

- **WHEN** user runs `axm subagents rename code-reviewer new-name`
- **AND** `code-reviewer` is locally authored (no registry or pack origin)
- **THEN** the rename SHALL proceed normally

### Requirement: Old name not found error

Attempting to rename a subagent that is not installed SHALL fail.

#### Scenario: Source subagent not found

- **WHEN** user runs `axm subagents rename nonexistent new-name`
- **AND** `nonexistent` is not installed
- **THEN** the CLI SHALL fail with an error indicating the subagent is not installed

### Requirement: Scope flag

`--scope` SHALL target the correct scope. Default SHALL be project scope.

#### Scenario: Rename in user scope

- **WHEN** user runs `axm subagents rename old-name new-name --scope user`
- **THEN** the rename SHALL apply to user-scope settings and user-level rendered files

### Requirement: Preview flag

`--preview` SHALL show what would change without applying.

#### Scenario: Preview shows rename plan

- **WHEN** user runs `axm subagents rename old-name new-name --preview`
- **THEN** the CLI SHALL display old and new file paths and settings changes
- **AND** no changes SHALL be applied

### Requirement: Confirmation and --yes flag

In interactive mode, rename SHALL prompt for confirmation. `--yes` SHALL skip.

#### Scenario: --yes skips confirmation

- **WHEN** user runs `axm subagents rename old-name new-name --yes`
- **THEN** the CLI SHALL rename without confirmation
