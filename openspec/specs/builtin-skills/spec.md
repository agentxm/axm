# builtin-skills Specification

## Purpose

TBD - created by archiving change init-builtin-pack. Update Purpose after archive.

## Requirements

### Requirement: Management skill for skills

The builtin pack SHALL include a `@axm/axm-manage-skills` skill with a SKILL.md that instructs the agent on managing skills via axm CLI.

#### Scenario: Skill content covers skill operations

- **WHEN** an agent reads the `axm-manage-skills` SKILL.md
- **THEN** it SHALL contain instructions for: `axm skills install`, `axm skills uninstall`, `axm skills list`, `axm skills update`, `axm skills enable`, `axm skills disable`, `axm skills fork`, `axm skills rename`, and `axm skills publish`

#### Scenario: Skill has valid frontmatter

- **WHEN** parsing the `axm-manage-skills` SKILL.md
- **THEN** it SHALL have frontmatter with `name: "axm-manage-skills"` and a `description` field

### Requirement: Management skill for packs

The builtin pack SHALL include a `@axm/axm-manage-packs` skill with a SKILL.md that instructs the agent on managing extension packs via axm CLI.

#### Scenario: Skill content covers pack operations

- **WHEN** an agent reads the `axm-manage-packs` SKILL.md
- **THEN** it SHALL contain instructions for: `axm packs install`, `axm packs uninstall`, `axm packs new`, `axm packs add`, `axm packs remove`, `axm packs publish`, and `axm packs unpack`

#### Scenario: Skill has valid frontmatter

- **WHEN** parsing the `axm-manage-packs` SKILL.md
- **THEN** it SHALL have frontmatter with `name: "axm-manage-packs"` and a `description` field

### Requirement: Management skill for MCP servers

The builtin pack SHALL include a `@axm/axm-manage-mcp-servers` skill with a SKILL.md that instructs the agent on managing MCP servers via axm CLI.

#### Scenario: Skill content covers MCP server operations

- **WHEN** an agent reads the `axm-manage-mcp-servers` SKILL.md
- **THEN** it SHALL contain instructions for available MCP server management commands

#### Scenario: Skill has valid frontmatter

- **WHEN** parsing the `axm-manage-mcp-servers` SKILL.md
- **THEN** it SHALL have frontmatter with `name: "axm-manage-mcp-servers"` and a `description` field

### Requirement: Management skill for commands

The builtin pack SHALL include a `@axm/axm-manage-commands` skill with a SKILL.md that instructs the agent on managing commands via axm CLI.

#### Scenario: Skill content covers command operations

- **WHEN** an agent reads the `axm-manage-commands` SKILL.md
- **THEN** it SHALL contain instructions for available command management operations

#### Scenario: Skill has valid frontmatter

- **WHEN** parsing the `axm-manage-commands` SKILL.md
- **THEN** it SHALL have frontmatter with `name: "axm-manage-commands"` and a `description` field

### Requirement: Pack manifest references all management skills

The bundled `axm-pack.json` for `@axm/cli` SHALL reference all management skills.

#### Scenario: Manifest lists skills

- **WHEN** reading the bundled `axm-pack.json`
- **THEN** the `skills` field SHALL contain entries for `@axm/axm-manage-skills`, `@axm/axm-manage-packs`, `@axm/axm-manage-mcp-servers`, and `@axm/axm-manage-commands`
