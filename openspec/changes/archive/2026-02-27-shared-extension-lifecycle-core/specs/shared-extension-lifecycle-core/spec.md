## ADDED Requirements

### Requirement: Plan readiness model

Each planned job step SHALL have one of three readiness states: `ready`, `warn`, or `error`.

- `ready`: The step is executable without conditions.
- `warn`: The step is executable but requires user acknowledgement before apply.
- `error`: The step has a known problem that prevents execution.

The previous `skip` readiness state is removed. Operations are idempotent; re-running an already-applied operation is a safe no-op.

#### Scenario: Ready step is executed during plan apply

- **WHEN** a plan contains a step with readiness `ready`
- **THEN** the step's `run` effect SHALL be executed during plan apply

#### Scenario: Warn step requires acknowledgement before execution

- **WHEN** a plan contains a step with readiness `warn`
- **AND** `--force` is not passed
- **THEN** the user SHALL be prompted for confirmation before the step is executed

#### Scenario: Error step prevents entire plan from executing

- **WHEN** a plan contains any step with readiness `error`
- **THEN** `resolvePlan` SHALL fail with an `AppError` (code: `PLAN_BLOCKED_BY_ERRORS`)
- **AND** no step `run` effects SHALL be executed

### Requirement: Force flag bypasses warn prompts

When `--force` is passed, `resolvePlan` SHALL auto-accept all warn-readiness steps without prompting the user for confirmation.

#### Scenario: Force flag skips warn confirmation

- **WHEN** a plan contains steps with readiness `warn`
- **AND** `--force` is passed
- **THEN** the warn steps SHALL be executed without user confirmation

### Requirement: Warn prompt cancellation

When the user declines a warn-readiness prompt, `resolvePlan` SHALL fail with `PromptCancelled` and no step `run` effects SHALL be executed.

#### Scenario: User declines warn confirmation

- **WHEN** a plan contains steps with readiness `warn`
- **AND** the user declines the confirmation prompt
- **THEN** `resolvePlan` SHALL fail with `PromptCancelled`
- **AND** no `run` effects SHALL have been executed

### Requirement: Step execution produces completed steps

Each executed step SHALL produce a `CompletedJobStep` with a `label` and a `JobStepResult` discriminated as either `success` or `error`.

#### Scenario: Successful step produces success result

- **WHEN** a ready step's `run` effect completes without error
- **THEN** the completed step SHALL have `result: "success"` with a message

#### Scenario: Failed step produces error result

- **WHEN** a ready step's `run` effect fails with an `AppError`
- **THEN** the completed step SHALL have `result: "error"` with the error details

### Requirement: Inter-job blocking on step failure

If any step in job N produces an error result (runtime failure), all steps in subsequent jobs (N+1, N+2, ...) SHALL be promoted to error results without execution.

#### Scenario: Step failure blocks subsequent jobs

- **WHEN** job 1 contains step A (succeeds) and step B (fails)
- **AND** job 2 contains step C
- **THEN** step A produces a success result
- **AND** step B produces an error result
- **AND** step C is promoted to an error result without execution

### Requirement: Intra-job continuation on step failure

Steps within the same job SHALL continue executing even if another step in that job produces an error result. There SHALL be no early abort within a job.

#### Scenario: Same-job steps continue after sibling failure

- **WHEN** job 1 contains step A (fails) and step B (ready)
- **THEN** both step A and step B SHALL be executed
- **AND** step A produces an error result
- **AND** step B produces its own result independently

### Requirement: Install operation canonical sequence

The install operation SHALL execute the following steps in order for each extension:

1. Materialize the extension on disk
2. Upsert the lockfile entry
3. Upsert the settings entry

#### Scenario: Install operation completes all steps in order

- **WHEN** an install operation runs for an extension
- **THEN** the extension SHALL be materialized on disk first
- **AND** the lockfile entry SHALL be upserted second
- **AND** the settings entry SHALL be upserted third

### Requirement: Uninstall operation with retention check

The uninstall operation SHALL check whether the extension is still required by an installed pack before performing full removal.

If the extension is required by an installed pack:

1. Remove the settings entry
2. Mark the extension as retained in the lockfile

If the extension is not required by any installed pack:

1. Remove the extension from disk (unmaterialize)
2. Remove the lockfile entry
3. Remove the settings entry

#### Scenario: Uninstall retains pack-required extension

- **WHEN** an uninstall operation runs for skill `code-review`
- **AND** `code-review` is referenced by an installed pack's resolved dependencies
- **THEN** the settings entry SHALL be removed
- **AND** the lockfile entry SHALL be updated to indicate retention
- **AND** the extension SHALL remain on disk

#### Scenario: Uninstall fully removes unreferenced extension

- **WHEN** an uninstall operation runs for skill `code-review`
- **AND** `code-review` is not referenced by any installed pack
- **THEN** the extension SHALL be removed from disk
- **AND** the lockfile entry SHALL be removed
- **AND** the settings entry SHALL be removed

### Requirement: Idempotent operation execution

Install and uninstall operations SHALL be idempotent. Re-running an already-applied operation SHALL produce a success result without adverse effects.

#### Scenario: Re-installing an already installed extension succeeds

- **WHEN** an install operation runs for an extension that is already installed
- **THEN** the operation SHALL complete with a success result
- **AND** the extension state SHALL remain consistent

#### Scenario: Re-uninstalling an already removed extension succeeds

- **WHEN** an uninstall operation runs for an extension that is already removed
- **THEN** the operation SHALL complete with a success result

### Requirement: Extension manager contract

Each extension type (`skill`, `pack`, `command`, `mcp-server`) SHALL have a manager service that provides:

- `materializeInstall`: Install the extension on disk
- `materializeUninstall`: Remove the extension from disk
- `upsertSettingsEntry`: Add or update the settings entry
- `removeSettingsEntry`: Remove the settings entry
- `upsertLockfileEntry`: Add or update the lockfile entry
- `removeLockfileEntry`: Remove the lockfile entry

Manager methods SHALL have no runtime service requirements (`R = never`). All dependencies SHALL be captured during manager construction.

#### Scenario: Skill manager satisfies contract

- **WHEN** `SkillManager` is constructed
- **THEN** it SHALL implement all extension manager methods for skill extension refs

#### Scenario: Pack manager satisfies contract

- **WHEN** `PackManager` is constructed
- **THEN** it SHALL implement all extension manager methods for pack extension refs

#### Scenario: Command manager satisfies contract

- **WHEN** `CommandManager` is constructed
- **THEN** it SHALL implement all extension manager methods for command extension refs

#### Scenario: MCP server manager satisfies contract

- **WHEN** `McpServerManager` is constructed
- **THEN** it SHALL implement all extension manager methods for mcp-server extension refs

### Requirement: Extension target types

Uninstall operations SHALL use typed extension targets for identifying extensions to remove. Pack targets SHALL include a namespace. Skill, command, and mcp-server targets SHALL be name-only.

#### Scenario: Pack target includes namespace

- **WHEN** an uninstall target is created for pack `effect` in namespace `@axm`
- **THEN** the target SHALL have type `pack`, name `effect`, and namespace `@axm`
- **AND** the target label SHALL be `@axm/effect`

#### Scenario: Skill target is name-only

- **WHEN** an uninstall target is created for skill `code-review`
- **THEN** the target SHALL have type `skill` and name `code-review`
- **AND** the target label SHALL be `code-review`

#### Scenario: Command target is name-only

- **WHEN** an uninstall target is created for command `formatter`
- **THEN** the target SHALL have type `command` and name `formatter`

#### Scenario: MCP server target is name-only

- **WHEN** an uninstall target is created for mcp-server `db-connector`
- **THEN** the target SHALL have type `mcp-server` and name `db-connector`

### Requirement: Executed plan structure

`resolvePlan` SHALL return an `ExecutedPlan` containing `CompletedJobStep` entries for every planned step. The plan preserves job structure and step order from the original plan.

#### Scenario: Executed plan mirrors original plan structure

- **WHEN** a plan with 2 jobs containing 3 total steps is resolved and applied
- **THEN** the executed plan SHALL contain 2 jobs with the same step distribution
- **AND** each completed step SHALL have a label and result
- **AND** step order SHALL match the original plan

### Requirement: Plan step run effects are self-contained

Each planned job step's `run` effect SHALL be `Effect<JobStepResult, AppError, never>`. All dependencies required for step execution SHALL be resolved before plan construction and captured in the step's closure.

#### Scenario: Step execution requires no runtime service resolution

- **WHEN** `applyPlan` executes a step's `run` effect
- **THEN** the execution SHALL not require resolving any services from the environment
- **AND** the step SHALL execute using only its captured closure state

### Requirement: Skill manager branches by packaging kind

The `SkillManager` SHALL dispatch materialization behavior based on `PackagingKind` (`native` vs `non-native`). This branching SHALL be internal to the manager, not in the shared operation workflow.

#### Scenario: Native skill uses native materialization

- **WHEN** a skill with `PackagingKind` `native` is installed
- **THEN** `SkillManager` SHALL use native-specific materialization behavior

#### Scenario: Non-native skill uses source-backed materialization

- **WHEN** a skill with `PackagingKind` `non-native` is installed
- **THEN** `SkillManager` SHALL use source-backed materialization behavior

### Requirement: Skill install creates agent symlinks for all configured agents

When a skill is installed, the `SkillManager` SHALL create agent symlinks for all agents returned by the workspace's configured agent list at manager construction time.

#### Scenario: Skill installed to all configured agents

- **WHEN** skill `code-review` is installed
- **AND** the workspace has configured agents `["claude"]`
- **THEN** agent symlinks SHALL be created for `claude`

#### Scenario: Skill installed to multiple configured agents

- **WHEN** skill `code-review` is installed
- **AND** the workspace has configured agents `["claude", "cursor"]`
- **THEN** agent symlinks SHALL be created for both `claude` and `cursor`

### Requirement: Skill lockfile entry records configured agents

Skill lock entries SHALL include an `agents` field reflecting the configured agents at the time of install.

#### Scenario: Lock entry includes agents

- **WHEN** skill `code-review` is installed
- **AND** configured agents are `["claude"]`
- **THEN** the skill lock entry SHALL include `agents: ["claude"]`
