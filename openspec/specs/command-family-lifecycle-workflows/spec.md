## ADDED Requirements

### Requirement: Install command workflow phases

The install command workflow SHALL execute phases in this order:

1. Parse command arguments
2. Resolve source requests from parsed arguments
3. Discover extension refs from source requests
4. Finalize intent from parsed arguments and discovered refs
5. Build plan from intent
6. Resolve and apply plan via `resolvePlan`

#### Scenario: Install workflow executes all phases in order

- **WHEN** an install command runs for any supported extension type
- **THEN** arguments SHALL be parsed first
- **AND** source requests SHALL be resolved from parsed arguments
- **AND** extension refs SHALL be discovered from source requests
- **AND** intent SHALL be finalized from parsed arguments and discovered refs
- **AND** a plan SHALL be built from the intent
- **AND** the plan SHALL be resolved and applied

### Requirement: Uninstall command workflow phases

The uninstall command workflow SHALL execute phases in this order:

1. Parse command arguments
2. Finalize intent from parsed arguments
3. Build uninstall plan from intent
4. Resolve and apply plan via `resolvePlan`

#### Scenario: Uninstall workflow executes all phases in order

- **WHEN** an uninstall command runs for any supported extension type
- **THEN** arguments SHALL be parsed first
- **AND** intent SHALL be finalized from parsed arguments
- **AND** an uninstall plan SHALL be built from the intent
- **AND** the plan SHALL be resolved and applied

### Requirement: Command-specific workflow actions

Each supported extension type SHALL provide its own implementation of workflow actions. Install actions SHALL implement type-specific parsing, source resolution, discovery, intent finalization, and plan building. Uninstall actions SHALL implement type-specific parsing, intent finalization, and uninstall plan building.

#### Scenario: Skill install provides workflow actions

- **WHEN** `axm skills install` runs
- **THEN** the install workflow SHALL use skill-specific actions for all phases

#### Scenario: Pack install provides workflow actions

- **WHEN** `axm packs install` runs
- **THEN** the install workflow SHALL use pack-specific actions for all phases

#### Scenario: Command install provides workflow actions

- **WHEN** `axm commands install` runs
- **THEN** the install workflow SHALL use command-specific actions for all phases

#### Scenario: MCP server install provides workflow actions

- **WHEN** `axm mcp-servers install` runs
- **THEN** the install workflow SHALL use mcp-server-specific actions for all phases

#### Scenario: Skill uninstall provides workflow actions

- **WHEN** `axm skills uninstall` runs
- **THEN** the uninstall workflow SHALL use skill-specific actions for all phases

#### Scenario: Pack uninstall provides workflow actions

- **WHEN** `axm packs uninstall` runs
- **THEN** the uninstall workflow SHALL use pack-specific actions for all phases

#### Scenario: Command uninstall provides workflow actions

- **WHEN** `axm commands uninstall` runs
- **THEN** the uninstall workflow SHALL use command-specific actions for all phases

#### Scenario: MCP server uninstall provides workflow actions

- **WHEN** `axm mcp-servers uninstall` runs
- **THEN** the uninstall workflow SHALL use mcp-server-specific actions for all phases

### Requirement: Workflow reuse across extension types

The install command workflow orchestration SHALL be shared across all supported extension types (`skill`, `pack`, `command`, `mcp-server`). The uninstall command workflow orchestration SHALL be shared across all supported extension types. Only the workflow actions differ per type.

#### Scenario: Same install orchestration for skills and packs

- **WHEN** `axm skills install` and `axm packs install` are executed
- **THEN** both SHALL use the same install command workflow orchestration
- **AND** only the type-specific actions SHALL differ

#### Scenario: Same uninstall orchestration for skills and packs

- **WHEN** `axm skills uninstall` and `axm packs uninstall` are executed
- **THEN** both SHALL use the same uninstall command workflow orchestration
- **AND** only the type-specific actions SHALL differ

### Requirement: Thin command handlers

Command handlers for install and uninstall SHALL delegate entirely to the command-family workflow. Handlers SHALL resolve the type-specific workflow actions service and invoke the shared workflow. Handlers SHALL NOT contain orchestration logic, source resolution, discovery, or plan building directly.

#### Scenario: Skill install handler delegates to workflow

- **WHEN** the skill install handler is invoked
- **THEN** it SHALL resolve `InstallSkillCommandWorkflowActions`
- **AND** invoke `runInstallCommandWorkflow` with the args and actions

#### Scenario: Pack uninstall handler delegates to workflow

- **WHEN** the pack uninstall handler is invoked
- **THEN** it SHALL resolve `UninstallPackCommandWorkflowActions`
- **AND** invoke `runUninstallCommandWorkflow` with the args and actions
