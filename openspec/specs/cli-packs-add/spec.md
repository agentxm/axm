# cli-packs-add Specification

## Purpose

The `axm packs add` command adds managed, registry-sourced extensions to a pack's manifest.

## Requirements

### Requirement: Add extension to pack manifest

`axm packs add <pack> <extension>` SHALL add a managed, registry-sourced extension to the specified pack's `pack.json` manifest.

This is a manifest edit only — it SHALL NOT install or uninstall any extensions in the workspace.

The default version specifier SHALL be `*` (stay current). Authors SHALL specify constraints inline using the `@version` syntax (e.g., `@acme/tool@^1.0.0`).

#### Scenario: Add specific extension by name

- **WHEN** user runs `axm packs add frontend-tools @acme/code-review`
- **AND** `@acme/code-review` is a managed, registry-sourced skill installed in the workspace
- **THEN** `pack.json` gains entry `skills: { "@acme/code-review": "*" }`

#### Scenario: Add extension with explicit version constraint

- **WHEN** user runs `axm packs add frontend-tools @acme/code-review@^1.0.0`
- **THEN** `pack.json` gains entry `skills: { "@acme/code-review": "^1.0.0" }`

#### Scenario: Add extension with exact pin

- **WHEN** user runs `axm packs add frontend-tools @acme/code-review@1.2.3`
- **THEN** `pack.json` gains entry `skills: { "@acme/code-review": "1.2.3" }`

#### Scenario: Add command extension

- **WHEN** user runs `axm packs add frontend-tools @acme/formatter`
- **AND** `@acme/formatter` is a managed, registry-sourced command
- **THEN** `pack.json` gains entry `commands: { "@acme/formatter": "*" }`

#### Scenario: Add MCP server extension

- **WHEN** user runs `axm packs add frontend-tools @acme/db-browser`
- **AND** `@acme/db-browser` is a managed, registry-sourced MCP server
- **THEN** `pack.json` gains entry `mcp-servers: { "@acme/db-browser": "*" }`

#### Scenario: Extension already in pack

- **WHEN** user runs `axm packs add frontend-tools @acme/code-review`
- **AND** `@acme/code-review` is already in the pack manifest
- **THEN** the command reports no-op (extension already present)

### Requirement: Glob pattern expansion for add

When the extension argument contains a glob pattern, the system SHALL expand it against all managed, registry-sourced extensions currently installed in the workspace.

#### Scenario: Glob matches multiple extensions

- **WHEN** user runs `axm packs add my-pack "effect-*"`
- **AND** workspace has installed skills `@acme/effect-basics`, `@acme/effect-streams`, and `@acme/effect-testing`
- **THEN** all three skills are added to the pack manifest

#### Scenario: Glob matches no extensions

- **WHEN** user runs `axm packs add my-pack "nonexistent-*"`
- **AND** no installed extensions match the pattern
- **THEN** the command fails with a `AppError` indicating no extensions matched

#### Scenario: Glob excludes non-registry extensions

- **WHEN** user runs `axm packs add my-pack "code-*"`
- **AND** `code-helper` is installed from GitHub (non-registry)
- **AND** `@acme/code-review` is installed from registry
- **THEN** only `@acme/code-review` is added (non-registry extensions are excluded)

### Requirement: Extension type inference

The system SHALL infer the extension type (skill, command, mcp-server) from the lockfile or settings — no `--type` flag is needed.

#### Scenario: Type inferred from lockfile

- **WHEN** user runs `axm packs add my-pack @acme/code-review`
- **AND** the lockfile contains `@acme/code-review` as a skill
- **THEN** the extension is added to the `skills` section of the pack manifest

### Requirement: Non-registry extension rejected

`axm packs add` SHALL reject extensions that are not managed and registry-sourced.

#### Scenario: Non-registry extension rejected

- **WHEN** user runs `axm packs add my-pack some-local-skill`
- **AND** `some-local-skill` is installed from a local path
- **THEN** the command fails with a `AppError` indicating only managed, registry-sourced extensions can be added to packs

### Requirement: Pack must exist

`axm packs add` SHALL fail if the specified pack does not exist locally.

#### Scenario: Pack not found

- **WHEN** user runs `axm packs add nonexistent-pack @acme/code-review`
- **AND** no pack named `nonexistent-pack` exists
- **THEN** the command fails with a `AppError` indicating the pack was not found

### Requirement: Packs add uses plan execution with precomputed delta

The `axm packs add` handler SHALL compute manifest add changes during planning and execute those exact changes via an operation resolved through `ws.resolvePlan()`.

#### Scenario: Build and resolve add-to-pack plan

- **WHEN** the user runs `axm packs add <pack> <extension>` and matching extensions are found
- **THEN** the handler SHALL compute the manifest delta to add
- **AND** the handler SHALL build a plan that carries that precomputed delta
- **AND** the handler SHALL execute the plan via `ws.resolvePlan()`

#### Scenario: Stale manifest conflict on apply

- **WHEN** a precomputed add delta is planned
- **AND** the target manifest changes before apply
- **THEN** the operation SHALL fail with a `AppError` conflict indicating stale manifest state
- **AND** the operation SHALL NOT write a partial manifest update

### Requirement: Packs add supports preview mode

The `axm packs add` command SHALL accept `--preview` and route it through workspace plan resolution.

#### Scenario: Preview mode for packs add

- **WHEN** the user runs `axm packs add <pack> <extension> --preview`
- **THEN** the CLI SHALL display planned manifest additions
- **AND** the pack manifest SHALL remain unchanged
