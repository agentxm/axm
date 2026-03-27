## ADDED Requirements

### Requirement: ExtensionManager contract in core

The `@axm.sh/core/unstable/extension-operations` module SHALL export the `ExtensionManager<TRef>` interface. The interface SHALL define six methods: `materializeInstall`, `materializeUninstall`, `upsertSettingsEntry`, `removeSettingsEntry`, `upsertLockfileEntry`, `removeLockfileEntry`. All methods SHALL have `R = never` — dependencies are captured at construction time, not resolved at call time.

#### Scenario: ExtensionManager has no runtime service requirements

- **WHEN** a consumer calls any method on an `ExtensionManager`
- **THEN** the method's Effect type SHALL be `Effect<void, AppError, never>`
- **AND** no services need to be provided in the environment

#### Scenario: ExtensionManager is generic over ref type

- **WHEN** constructing a `SkillExtensionManager`
- **THEN** its type SHALL be `ExtensionManager<SkillExtensionRef>`
- **AND** its `materializeInstall` SHALL accept `{ ref: SkillExtensionRef }`

### Requirement: ExtensionTarget types in core

The `@axm.sh/core/unstable/extension-operations` module SHALL export `ExtensionTarget`, `SkillExtensionTarget`, `PackExtensionTarget`, `CommandExtensionTarget`, `McpServerExtensionTarget`, and the `ExtensionTargetFor<TRef>` utility type. Pack targets SHALL include a `profile` field. Skill, command, and mcp-server targets SHALL be name-only.

#### Scenario: Pack target includes profile

- **WHEN** an `ExtensionTarget` is created for a pack
- **THEN** it SHALL have `type: "pack"`, `name`, and `profile`

#### Scenario: Skill target is name-only

- **WHEN** an `ExtensionTarget` is created for a skill
- **THEN** it SHALL have `type: "skill"` and `name` only

### Requirement: UninstallRetentionPolicy in core

The `@axm.sh/core/unstable/extension-operations` module SHALL export the `UninstallRetentionPolicy` interface with `isRequiredByInstalledPack` and `markDependencyRetainedInLockfile` methods.

#### Scenario: Retention policy checks pack dependency

- **WHEN** `isRequiredByInstalledPack({ target })` is called
- **THEN** it SHALL return `Effect<boolean, AppError, never>` indicating whether the target is still referenced by an installed pack

### Requirement: buildInstallOperation in core

The `@axm.sh/core/unstable/extension-operations` module SHALL export `buildInstallOperation`. It SHALL accept an `ExtensionManager<TRef>` and `InstallOperationArgs<TRef>` and return a `PlannedJobStep` with `readiness: "ready"`. The step's `run` closure SHALL execute the canonical sequence: materialize on disk, upsert lockfile entry, upsert settings entry.

#### Scenario: Install operation follows canonical sequence

- **WHEN** `buildInstallOperation(manager, args)` produces a step and the step runs
- **THEN** `manager.materializeInstall` SHALL be called first
- **AND** `manager.upsertLockfileEntry` SHALL be called second
- **AND** `manager.upsertSettingsEntry` SHALL be called third

#### Scenario: Install operation skips settings when requested

- **WHEN** `buildInstallOperation(manager, { ...args, skipSettings: true })` produces a step and the step runs
- **THEN** `manager.upsertSettingsEntry` SHALL NOT be called

#### Scenario: Install operation step has no service requirements

- **WHEN** `buildInstallOperation` returns a `PlannedJobStep`
- **THEN** the step's `run` SHALL be `Effect<JobStepResult, AppError, never>`

### Requirement: buildUninstallOperation in core

The `@axm.sh/core/unstable/extension-operations` module SHALL export `buildUninstallOperation`. It SHALL accept an `ExtensionManager<TRef>`, `UninstallRetentionPolicy`, and `UninstallOperationArgs<TRef>`, returning a `PlannedJobStep` with `readiness: "ready"`.

#### Scenario: Uninstall fully removes unreferenced extension

- **WHEN** the step runs and `retentionPolicy.isRequiredByInstalledPack` returns `false`
- **THEN** `manager.materializeUninstall` SHALL be called first
- **AND** `manager.removeLockfileEntry` SHALL be called second
- **AND** `manager.removeSettingsEntry` SHALL be called third

#### Scenario: Uninstall retains pack-required extension

- **WHEN** the step runs and `retentionPolicy.isRequiredByInstalledPack` returns `true`
- **THEN** `manager.removeSettingsEntry` SHALL be called
- **AND** `retentionPolicy.markDependencyRetainedInLockfile` SHALL be called
- **AND** `manager.materializeUninstall` SHALL NOT be called

### Requirement: Extension managers in core

The `@axm.sh/core/unstable/extension-managers` module SHALL export manager implementations for all four extension types: `SkillExtensionManager`, `PackExtensionManager`, `CommandExtensionManager`, `McpServerExtensionManager`. Each SHALL implement the `ExtensionManager` contract. Each SHALL capture all dependencies (Workspace, RegistryClient, SourceHostProviders, CodingAgentRepository) at construction time.

#### Scenario: Skill manager implements ExtensionManager contract

- **WHEN** `SkillExtensionManager` is constructed with its dependencies
- **THEN** it SHALL satisfy `ExtensionManager<SkillExtensionRef>`
- **AND** all methods SHALL have `R = never`

#### Scenario: MCP server manager implements ExtensionManager contract

- **WHEN** `McpServerExtensionManager` is constructed with its dependencies
- **THEN** it SHALL satisfy `ExtensionManager<McpServerExtensionRef>`

#### Scenario: Managers depend on CodingAgentRepository interface from core

- **WHEN** `SkillExtensionManager` or `McpServerExtensionManager` is constructed
- **THEN** it SHALL accept a `CodingAgentRepository` interface (defined in core)
- **AND** it SHALL NOT depend on the concrete `DefaultCodingAgentRepository` implementation

### Requirement: CodingAgentRepository interface in core

The `@axm.sh/core/unstable/agents` module SHALL export a `CodingAgentRepository` service interface. The interface SHALL define methods needed by extension managers for agent symlink management. The concrete implementation SHALL remain in the CLI package.

#### Scenario: Interface provides agent listing for symlink creation

- **WHEN** an extension manager calls `CodingAgentRepository` during install
- **THEN** the repository SHALL provide the configured agents and their skills directory paths

#### Scenario: Concrete implementation stays in CLI

- **WHEN** the CLI runtime is composed
- **THEN** `DefaultCodingAgentRepository` SHALL be provided as the `CodingAgentRepository` layer
- **AND** `DefaultCodingAgentRepository` SHALL NOT be exported from core

### Requirement: Extension operations in core

The `@axm.sh/core/unstable/extension-managers` module SHALL export per-type operation functions (install, uninstall, enable, disable, rename) for each extension type. These are the business logic functions that the managers delegate to.

#### Scenario: Skill operations available from core

- **WHEN** a consumer imports from `@axm.sh/core/unstable/extension-managers`
- **THEN** skill install, uninstall, enable, disable, rename, and fork operations SHALL be available

#### Scenario: Operations have no CLI-specific dependencies

- **WHEN** inspecting the imports of any extension operation
- **THEN** it SHALL NOT import from any CLI module
- **AND** its dependencies SHALL be captured via constructor injection or Effect services defined in core
