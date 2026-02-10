## MODIFIED Requirements

### Requirement: Fork builds three sequential operations

The fork command SHALL build a plan with three sequential operations: fork, publish, install.

#### Scenario: Single skill fork plan

- **WHEN** forking a single skill
- **THEN** the plan contains: `ForkSkillOperation` then `PublishSkillOperation` then `InstallSkillOperation`

#### Scenario: Operations execute sequentially

- **WHEN** the plan is executed
- **THEN** fork completes before publish, publish completes before install (concurrency: 1)

#### Scenario: Install operation uses registry source

- **WHEN** the `InstallSkillOperation` is constructed for a forked skill
- **THEN** its `source` SHALL be `{ source: "registry" }`
- **AND** its `location` SHALL point to the registry extension path
- **AND** `force` SHALL be `true`

#### Scenario: Settings updated after fork

- **WHEN** the fork plan completes successfully
- **THEN** the forked skill SHALL appear in `settings.json` under `skills`
- **AND** the settings entry SHALL use the registry source string

#### Scenario: No manual post-plan bookkeeping

- **WHEN** the fork plan completes
- **THEN** lockfile updates, settings updates, and agent symlink creation SHALL be handled entirely by the `install-skill` operation
- **AND** the fork handler SHALL NOT perform these steps outside the plan
