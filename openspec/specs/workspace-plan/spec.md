## Requirements

### Requirement: Extension-agnostic plan types

The workspace module SHALL define generic plan types parameterized over the operation type, enabling reuse across extension types (skills, commands, mcp-servers, rules) and operation types (install, uninstall).

#### Scenario: OperationResult type

- **WHEN** defining the `OperationResult` type
- **THEN** it SHALL have fields `result: "no-op" | "success" | "error"` and `message: string`
- **AND** it SHALL be defined in `plan.ts` (not `apply-plan.ts`)

#### Scenario: JobStep is a discriminated union

- **WHEN** defining the `JobStep` type
- **THEN** it SHALL be `JobStep<Op> = PlannedJobStep<Op> | JobStepResult<Op>`
- **AND** the discriminant field SHALL be `_tag`

#### Scenario: PlannedJobStep carries expected result

- **WHEN** defining the `PlannedJobStep` type
- **THEN** it SHALL have fields: `_tag: "PlannedJobStep"`, `operation: Op`, `expectedResult: OperationResult`, and `label: string`
- **AND** it SHALL NOT have a `reason` field (reason is part of `expectedResult.message`)
- **AND** it SHALL NOT have an `actualResult` field

#### Scenario: JobStepResult carries both expected and actual result

- **WHEN** defining the `JobStepResult` type
- **THEN** it SHALL have fields: `_tag: "JobStepResult"`, `operation: Op`, `expectedResult: OperationResult`, `actualResult: OperationResult`, and `label: string`

#### Scenario: Job type is generic

- **WHEN** defining the `Job` type
- **THEN** it SHALL be `Job<Op>` containing `steps: ReadonlyArray<JobStep<Op>>` and `concurrency: "unbounded" | 1`

#### Scenario: Plan type is generic

- **WHEN** defining the `Plan` type
- **THEN** it SHALL be `Plan<Op>` containing `name: string`, `description: Option<string>`, and `jobs: ReadonlyArray<Job<Op>>`

#### Scenario: Label enables extension-agnostic rendering

- **WHEN** display or apply modules access a step
- **THEN** they SHALL use `step.label` for human-readable identification
- **AND** they SHALL NOT inspect `step.operation` to derive display text

### Requirement: Display plan summary

The plan display module SHALL render a human-readable summary of any `Plan<Op>` via Clack, without knowledge of the specific operation type. It SHALL handle both unapplied plans (containing `PlannedJobStep`) and applied plans (containing `JobStepResult`).

#### Scenario: Plan name as heading

- **WHEN** displaying a plan
- **THEN** the display SHALL use `plan.name` as the heading

#### Scenario: Plan description shown when present

- **WHEN** displaying a plan with `description: Option.some(text)`
- **THEN** the display SHALL show the description text below the heading

#### Scenario: Determine result from step variant

- **WHEN** rendering a step
- **THEN** for `PlannedJobStep`, the display SHALL use `expectedResult`
- **AND** for `JobStepResult`, the display SHALL use `actualResult`

#### Scenario: Show success items for unapplied plan

- **WHEN** the plan contains `PlannedJobStep` steps with `expectedResult.result === "success"`
- **THEN** the display SHALL list each step's `label` with a pending indicator (e.g., `+ label`)

#### Scenario: Show success items for applied plan

- **WHEN** the plan contains `JobStepResult` steps with `actualResult.result === "success"`
- **THEN** the display SHALL list each step's `label` with a success indicator (e.g., checkmark)

#### Scenario: Show no-op items with message

- **WHEN** a step has result `"no-op"`
- **THEN** the display SHALL list the step's `label` with the result's `message` as the reason

#### Scenario: Show error items with message

- **WHEN** a step has result `"error"`
- **THEN** the display SHALL list the step's `label` with the result's `message` as the reason

#### Scenario: Show summary counts

- **WHEN** displaying a plan
- **THEN** the display SHALL show a summary line with success and skip counts
- **AND** for unapplied plans, the summary SHALL use future tense (e.g., "N to install, M to skip")
- **AND** for applied plans, the summary SHALL use past tense (e.g., "N installed, M skipped")

#### Scenario: All no-ops

- **WHEN** every step in the plan has result `"no-op"`
- **THEN** the display SHALL show the skipped items and summary
- **AND** the summary SHALL indicate nothing to execute

### Requirement: Apply plan orchestration

The plan apply module SHALL iterate over plan jobs and their steps, promoting each `PlannedJobStep` to a `JobStepResult`. Steps with `expectedResult.result === "success"` are dispatched to handlers; all other steps set `actualResult` to their `expectedResult` directly. `applyPlan` SHALL return a new `Plan<Op>` with all steps promoted to `JobStepResult`.

#### Scenario: Job concurrency respected

- **WHEN** applying a job with `concurrency: "unbounded"`
- **THEN** the system SHALL execute steps concurrently using `Effect.forEach` with `{ concurrency: "unbounded" }`

#### Scenario: Job sequential execution

- **WHEN** applying a job with `concurrency: 1`
- **THEN** the system SHALL execute steps sequentially

#### Scenario: Dispatch step expected to succeed

- **WHEN** applying a step with `expectedResult.result === "success"`
- **THEN** the system SHALL dispatch it to the matching handler
- **AND** the handler SHALL return an `OperationResult`
- **AND** the step SHALL be promoted to `JobStepResult` with the handler's return value as `actualResult`

#### Scenario: Non-success step promoted with expectedResult as actualResult

- **WHEN** a step has `expectedResult.result` that is not `"success"`
- **THEN** the system SHALL promote it to `JobStepResult` with `actualResult` set to `expectedResult`
- **AND** the system SHALL NOT dispatch any handler for that step

#### Scenario: applyPlan returns Plan with promoted steps

- **WHEN** `applyPlan` completes
- **THEN** it SHALL return a `Plan<Op>` where every step is a `JobStepResult`
- **AND** the returned plan SHALL preserve the original `name`, `description`, and job structure

#### Scenario: No steps expected to succeed

- **WHEN** every step in the plan has `expectedResult.result !== "success"`
- **THEN** the system SHALL NOT dispatch any handlers
- **AND** each step SHALL be promoted to `JobStepResult` with `actualResult` equal to `expectedResult`

### Requirement: Workspace provides source queries

Existing source query methods SHALL be renamed to follow the `getConfigured*` naming convention: `getSources` → `getConfiguredSources`, `getSourceByName` → `getConfiguredSourceByName`, `getRegistrySources` → `getConfiguredRegistrySources`. Behavior is unchanged.

### Requirement: Workspace provides namespace query

The existing `getScope` method SHALL be renamed to `getConfiguredNamespace`. Behavior is unchanged.

#### Scenario: Namespace configured in project settings

- **WHEN** project settings contains `namespace: "@acme"`
- **THEN** `workspace.getConfiguredNamespace()` returns `"@acme"`

#### Scenario: Namespace configured in global settings only

- **WHEN** project settings does not contain a `namespace` field but global settings contains `namespace: "@corp"`
- **THEN** `workspace.getConfiguredNamespace()` returns `"@corp"`

#### Scenario: Namespace not configured

- **WHEN** neither project nor global settings contain a `namespace` field
- **THEN** `workspace.getConfiguredNamespace()` returns the default namespace `"@community"`

### Requirement: Workspace provides addSource mutation

The existing `addSource` method SHALL be renamed to `addConfiguredSource` and serialized by the workspace's single semaphore (replacing its previous independent semaphore). Behavior is otherwise unchanged.

### Requirement: Workspace provides getInstalledSkills query

The workspace service SHALL provide a `getInstalledSkills` method that reads settings from disk and returns the skills map.

#### Scenario: Skills configured

- **WHEN** settings contains skills entries
- **THEN** `workspace.getInstalledSkills()` returns the skills map

#### Scenario: No skills configured

- **WHEN** settings does not contain a `skills` field
- **THEN** `workspace.getInstalledSkills()` returns an empty record

### Requirement: Workspace provides setSkill compound mutation

The workspace service SHALL provide a `setSkill` method that atomically writes to both settings and lockfile under a single semaphore acquisition. This is the only public method for writing skill state — there are no individual `setInstalledSkill` or `setLockedSkill` public methods. If the skill already exists, both entries are replaced.

#### Scenario: Install a new skill

- **WHEN** a handler invokes `workspace.setSkill("code-review", "@community/code-review@^1.0.0", lockEntry)` and the skill does not exist
- **THEN** the service adds the skill entry to settings, adds the lock entry to the lockfile (setting `updatedAt` to the current time), and writes both files to disk under a single semaphore acquisition

#### Scenario: Update an existing skill

- **WHEN** a handler invokes `workspace.setSkill("code-review", "@community/code-review@^2.0.0", lockEntry)` and the skill already exists
- **THEN** the service replaces the skill entry in settings, replaces the lock entry in the lockfile (setting `updatedAt` to the current time), and writes both files to disk under a single semaphore acquisition

#### Scenario: Concurrent setSkill and addConfiguredSource do not lose data

- **WHEN** two fibers concurrently call `workspace.setSkill()` and `workspace.addConfiguredSource()`
- **THEN** both mutations are present in the final state because the single workspace semaphore serializes all state mutations

### Requirement: Workspace provides removeSkill compound mutation

The workspace service SHALL provide a `removeSkill` method that atomically removes from both settings and lockfile under a single semaphore acquisition. This is the only public method for removing skill state — there are no individual `removeInstalledSkill` or `removeLockedSkill` public methods.

#### Scenario: Remove an existing skill

- **WHEN** a handler invokes `workspace.removeSkill("code-review")` and the skill exists
- **THEN** the service removes the skill entry from settings, removes the lock entry from the lockfile, and writes both files to disk under a single semaphore acquisition

#### Scenario: Remove a non-existent skill

- **WHEN** a handler invokes `workspace.removeSkill("code-review")` and the skill does not exist in either file
- **THEN** the service completes without error (no-op)

### Requirement: Workspace provides getConfiguredAgents query

The workspace service SHALL provide a `getConfiguredAgents` method that reads settings from disk and returns the configured agent IDs.

#### Scenario: Agents configured

- **WHEN** settings contains `agents: ["claude-code", "cursor"]`
- **THEN** `workspace.getConfiguredAgents()` returns `["claude-code", "cursor"]`

#### Scenario: No agents configured

- **WHEN** settings does not contain an `agents` field
- **THEN** `workspace.getConfiguredAgents()` returns an empty array

### Requirement: Workspace provides addConfiguredAgent mutation

The workspace service SHALL provide an `addConfiguredAgent` method that writes to settings on disk, serialized by the workspace's single semaphore.

#### Scenario: Add a new agent

- **WHEN** a handler invokes `workspace.addConfiguredAgent("cursor")`
- **THEN** the service appends the agent ID to the agents array and writes to disk

#### Scenario: Agent already present

- **WHEN** a handler invokes `workspace.addConfiguredAgent("cursor")` and it is already in the agents array
- **THEN** the service completes without error (no-op)

#### Scenario: Invalid agent ID

- **WHEN** a handler invokes `workspace.addConfiguredAgent("not-a-real-agent")` with an invalid agent ID
- **THEN** the service SHALL fail with a `SettingsParseError`
- **AND** no changes SHALL be written to disk

### Requirement: Workspace provides getLockedSkills query

The workspace service SHALL provide a `getLockedSkills` method that reads the lockfile from disk and returns the skills lock map.

#### Scenario: Lock entries present

- **WHEN** the lockfile contains skill entries
- **THEN** `workspace.getLockedSkills()` returns the `SkillsLockMap` with all entries

#### Scenario: No lock entries present

- **WHEN** the lockfile contains no skill entries
- **THEN** `workspace.getLockedSkills()` returns an empty record

### Requirement: Workspace provides getLockedSkill query

The workspace service SHALL provide a `getLockedSkill` method that reads the lockfile from disk and returns the lock entry for a specific skill.

#### Scenario: Skill exists in lockfile

- **WHEN** a handler invokes `workspace.getLockedSkill("code-review")` and the skill exists
- **THEN** it returns `Option.some` containing the `SkillLockEntry`

#### Scenario: Skill not in lockfile

- **WHEN** a handler invokes `workspace.getLockedSkill("code-review")` and the skill does not exist
- **THEN** it returns `Option.none()`

### Requirement: Workspace serializes all state mutations with a single semaphore

The workspace service SHALL use a single `Semaphore(1)` to serialize ALL workspace state mutations: `setSkill`, `removeSkill` (compound, both files), `addConfiguredAgent`, `addConfiguredSource` (settings only). This replaces the previous pattern where settings service, lockfile service, and workspace each had independent semaphores.

#### Scenario: Concurrent install and source add do not interleave

- **WHEN** fibers concurrently invoke `workspace.setSkill()` and `workspace.addConfiguredSource()`
- **THEN** all mutations execute in sequence with no interleaving across files

#### Scenario: Same-file serialization

- **WHEN** fibers concurrently invoke `setSkill` and `addConfiguredSource` (both targeting settings)
- **THEN** both mutations execute in sequence, preventing read-modify-write races on `settings.json`

#### Scenario: Queries do not block on semaphore

- **WHEN** a query method (`getInstalledSkills`, `getConfiguredAgents`, `getConfiguredNamespace`, `getConfiguredSources`, `getLockedSkills`, `getLockedSkill`) is called while a mutation holds the semaphore
- **THEN** the query proceeds without waiting for the semaphore

### Requirement: Mutation failure releases the semaphore

The workspace semaphore SHALL be released when a mutation fails, ensuring subsequent operations are not permanently blocked. This is guaranteed by Effect's `withPermits` bracket semantics — no special error handling is required.

#### Scenario: Write failure releases semaphore

- **WHEN** a mutation (e.g., `setSkill`, `addConfiguredSource`) fails during the filesystem write
- **THEN** the workspace semaphore is released and subsequent mutations can proceed

### Requirement: Workspace documents state management responsibility

The workspace service SHALL include documentation comments indicating it is the sole public gateway for all settings and lockfile read/write operations and that it manages concurrency for all workspace state mutations via a single semaphore.

#### Scenario: Service documentation

- **WHEN** reading the workspace service source file
- **THEN** the module-level or interface-level doc comment SHALL indicate that workspace manages all settings and lockfile access and mutation serialization
