## ADDED Requirements

### Requirement: CLI schema file organization

The CLI package SHALL organize schema files by domain rather than by file type.

- Lockfile schemas SHALL reside in `cli/src/lockfile/`
- Settings schemas SHALL reside in `cli/src/settings/`
- Extension-related code SHALL reside in `cli/src/extensions/`
- Each extension type SHALL have its own folder under `extensions/`

#### Scenario: Lockfile schema location
- **WHEN** a developer looks for lockfile schema definitions
- **THEN** they find them in `packages/cli/src/lockfile/schema.ts`

#### Scenario: Settings schema location
- **WHEN** a developer looks for settings schema definitions
- **THEN** they find them in `packages/cli/src/settings/schema.ts`

#### Scenario: Extension manifest schema location
- **WHEN** a developer looks for a skill manifest schema
- **THEN** they find it in `packages/cli/src/extensions/skills/manifest-schema.ts`

#### Scenario: Extension common types location
- **WHEN** a developer needs shared extension types (Author, ExtensionType, etc.)
- **THEN** they find them in `packages/cli/src/extensions/common.ts`

### Requirement: Co-located generated JSON schemas

Each Effect schema that produces a JSON schema SHALL have its generated output in a `__generated__/` folder next to the source file.

#### Scenario: Lockfile JSON schema location
- **WHEN** the JSON schema generation script runs
- **THEN** `axm-lock.schema.json` is generated in `packages/cli/src/lockfile/__generated__/`

#### Scenario: Settings JSON schema location
- **WHEN** the JSON schema generation script runs
- **THEN** `settings.schema.json` is generated in `packages/cli/src/settings/__generated__/`

#### Scenario: Extension manifest JSON schema location
- **WHEN** the JSON schema generation script runs
- **THEN** each extension type's manifest schema is generated in its `__generated__/` folder:
  - `extensions/skills/__generated__/axm-skill.schema.json`
  - `extensions/commands/__generated__/axm-command.schema.json`
  - `extensions/mcp-servers/__generated__/axm-mcp-server.schema.json`
  - `extensions/packs/__generated__/axm-pack.schema.json`

### Requirement: No schemas barrel folder

The CLI package SHALL NOT have a top-level `schemas/` folder. Schema files SHALL be co-located with their domain.

#### Scenario: No schemas folder exists
- **WHEN** a developer looks for `packages/cli/src/schemas/`
- **THEN** the folder does not exist
