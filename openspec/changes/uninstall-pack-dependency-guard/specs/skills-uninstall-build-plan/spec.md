## MODIFIED Requirements

### Requirement: Build plan from operations and installed skills lookup

The uninstall plan builder SHALL accept `ReadonlyArray<UninstallSkillOperation>`, an `InstalledSkills` lookup (keyed by skill name, with `referencingPacks: ReadonlyArray<string>` per entry), a plan `name`, and a plan `description: Option<string>`, and return a `Plan<UninstallSkillOperation>` with one `PlannedJobStep` per operation.

#### Scenario: Skill installed with no pack dependencies

- **WHEN** a `UninstallSkillOperation` targets a skill name present in `InstalledSkills` with empty `referencingPacks`
- **THEN** the step SHALL have `readiness: { status: "ready", message: Option.none() }`

#### Scenario: Skill not installed

- **WHEN** a `UninstallSkillOperation` targets a skill name not present in `InstalledSkills`
- **THEN** the step SHALL have `readiness: { status: "skip", message: "not installed" }`

#### Scenario: Skill installed but referenced by one pack

- **WHEN** a `UninstallSkillOperation` targets a skill name present in `InstalledSkills` with `referencingPacks: ["starter"]`
- **THEN** the step SHALL have `readiness: { status: "error" }` with a message that names the pack "starter" and suggests using `axm skills disable <skill>` instead

#### Scenario: Skill installed but referenced by multiple packs

- **WHEN** a `UninstallSkillOperation` targets a skill name present in `InstalledSkills` with `referencingPacks: ["starter", "pro"]`
- **THEN** the step SHALL have `readiness: { status: "error" }` with a message that names both packs and suggests using `axm skills disable <skill>` instead

#### Scenario: Single job with sequential concurrency

- **WHEN** building a plan from any set of operations
- **THEN** the plan SHALL contain exactly one job with `concurrency: 1`

#### Scenario: Empty operations produce empty plan

- **WHEN** building a plan from an empty operations array
- **THEN** the plan SHALL contain one job with an empty steps array

### Requirement: Label derivation from skill name

The plan builder SHALL derive the `label` field for each step from the skill name in the operation.

#### Scenario: Label is skill name

- **WHEN** building a step from a `UninstallSkillOperation`
- **THEN** the step's `label` SHALL be `op.args.skillName`

### Requirement: Plan name and description

The plan builder SHALL use the caller-provided `name` and `description` on the returned plan.

#### Scenario: Plan uses provided name and description

- **WHEN** building a plan
- **THEN** the plan `name` SHALL be the `name` argument and the plan `description` SHALL be the `description` argument passed by the caller

## ADDED Requirements

### Requirement: InstalledSkills lookup type

The uninstall plan module SHALL export an `InstalledSkills` type defined as `ReadonlyRecord<string, { readonly referencingPacks: ReadonlyArray<string> }>`, keyed by skill name. Presence of a key indicates the skill is installed. The `referencingPacks` array lists pack names that reference the skill.

#### Scenario: Type is exported

- **WHEN** importing from the uninstall plan module
- **THEN** the `InstalledSkills` type SHALL be available for import

### Requirement: Handler builds InstalledSkills lookup

The uninstall handler SHALL build the `InstalledSkills` lookup by combining locked skills and locked packs data from the workspace, then pass it to the plan builder.

#### Scenario: Handler derives referencing packs for each locked skill

- **WHEN** the handler builds the `InstalledSkills` lookup
- **THEN** for each entry in `lockedSkills`, it SHALL derive the skill's FQN and check all entries in `lockedPacks` for references in their `resolvedSkills`
- **AND** the `referencingPacks` array SHALL contain the names of all packs that reference the skill's FQN

#### Scenario: Handler passes lookup to plan builder

- **WHEN** the handler calls `buildSkillUninstallPlan`
- **THEN** it SHALL pass the `InstalledSkills` lookup instead of a `Lockfile`
