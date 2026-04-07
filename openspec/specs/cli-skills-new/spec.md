# cli-skills-new Specification

## Purpose

The `axm skills new` command scaffolds a new managed skill with manifest, starter SKILL.md, settings registration, and agent symlinks.

## Requirements

### Requirement: Skills new command

The CLI SHALL provide `axm skills new <name>` to scaffold a new managed skill.

#### Scenario: Create a skill with configured profile

- **WHEN** the user runs `axm skills new my-skill`
- **THEN** the CLI creates the skill directory at `.axm/extensions/@<configured-owner>/skills/my-skill/`
- **AND** writes an `skill.json` manifest with `owner` set to `@<configured-owner>`, `name` set to `my-skill`, and `version` set to `0.0.1`
- **AND** creates `src/SKILL.md` with a starter template
- **AND** registers the skill in `settings.json` as a managed entry
- **AND** creates symlinks in all configured agent skill directories pointing to the `src/` subdirectory

#### Scenario: Create a skill with explicit profile

- **WHEN** the user runs `axm skills new my-skill --profile @acme`
- **THEN** the CLI uses `@acme` as the owner instead of the workspace-configured profile
- **AND** the skill directory is `.axm/extensions/@acme/skills/my-skill/`
- **AND** the manifest contains `owner: "@acme"` and `name: "my-skill"`

#### Scenario: Create a skill for specific agents

- **WHEN** the user runs `axm skills new my-skill --agent claude-code --agent cursor`
- **THEN** symlinks are created only in `.claude/skills/my-skill` and `.cursor/skills/my-skill`
- **AND** the lock entry records only those agents

#### Scenario: Skill already exists

- **WHEN** the user runs `axm skills new my-skill` and a skill named `my-skill` already exists in settings
- **THEN** the CLI fails with an error indicating the skill already exists
- **AND** no files are created or modified

#### Scenario: No profile configured and no --profile flag

- **WHEN** the user runs `axm skills new my-skill` and no profile is configured (or the configured profile is `@community`)
- **THEN** the CLI fails with an error indicating a profile is required
- **AND** suggests using `--profile` or configuring a profile via `axm init`

### Requirement: Starter SKILL.md template

The scaffolded `src/SKILL.md` SHALL contain a minimal template the author can fill in.

#### Scenario: SKILL.md content

- **WHEN** a skill is scaffolded
- **THEN** `src/SKILL.md` SHALL contain a YAML frontmatter block with `name` and `description` fields
- **AND** a body section with placeholder text prompting the author to describe the skill

### Requirement: Skills new command options

The `axm skills new` command SHALL support standard CLI flags.

#### Scenario: --yes flag skips confirmation

- **WHEN** the user runs `axm skills new my-skill --yes`
- **THEN** the skill is created without prompting for confirmation

#### Scenario: --preview flag shows plan without applying

- **WHEN** the user runs `axm skills new my-skill --preview`
- **THEN** the CLI displays what would be created (directory, manifest, symlinks)
- **AND** no files are created or modified

#### Scenario: --non-interactive flag disables prompts

- **WHEN** the user runs `axm skills new my-skill --non-interactive`
- **THEN** the CLI runs without interactive prompts and fails if interaction would be needed

### Requirement: Skill name validation

The `name` positional argument SHALL be validated as a valid skill name.

#### Scenario: Valid skill name accepted

- **WHEN** the user runs `axm skills new code-review`
- **THEN** the name is accepted and the skill is scaffolded

#### Scenario: Invalid skill name rejected

- **WHEN** the user runs `axm skills new` with a name that violates skill naming rules (e.g., starts with hyphen, contains uppercase, exceeds 64 characters)
- **THEN** the CLI fails with an error describing the naming constraint

### Requirement: Skills new handler uses plan execution

The `axm skills new` handler SHALL model workspace mutations as an operation plan and execute them through `ws.resolvePlan()`.

#### Scenario: Build and resolve create-skill plan

- **WHEN** the user runs `axm skills new <name>` with valid input
- **THEN** the handler SHALL build a single-step plan for skill scaffolding
- **AND** the handler SHALL execute that plan via `ws.resolvePlan()`
- **AND** the handler SHALL NOT perform direct mutation writes outside operation handlers

#### Scenario: Preview mode for skills new

- **WHEN** the user runs `axm skills new <name> --preview`
- **THEN** the CLI SHALL display planned scaffold actions (directory/file creation, settings entry, agent links)
- **AND** no files, settings, or lockfile entries SHALL be modified

#### Scenario: Apply mode executes operation side-effects

- **WHEN** the user runs `axm skills new <name>` without preview and confirms apply (or passes `--yes`)
- **THEN** the operation handler SHALL perform skill scaffolding side-effects
- **AND** the handler result SHALL be reported through the plan execution flow
