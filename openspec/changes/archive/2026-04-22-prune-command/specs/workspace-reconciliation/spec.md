## MODIFIED Requirements

### Requirement: Classifier carries artifact locations through classification

The workspace classifier SHALL accept detected entries with locations (not just names) and SHALL attach locations to `lifecycle: "unmanaged"` classified extensions. Locations SHALL be relative to the workspace root.

#### Scenario: Unmanaged extension includes locations

- **WHEN** `detectSkillNamesOnDisk` discovers skill `legacy-tool` at `.claude/skills/legacy-tool`
- **AND** `legacy-tool` is classified as `lifecycle: "unmanaged"`
- **THEN** the classified extension entry SHALL include `locations: [".claude/skills/legacy-tool"]`

#### Scenario: Unmanaged extension in multiple agent directories

- **WHEN** `detectSkillNamesOnDisk` discovers skill `old-skill` at both `.claude/skills/old-skill` and `.agents/skills/old-skill`
- **AND** `old-skill` is classified as `lifecycle: "unmanaged"`
- **THEN** the classified extension entry SHALL include `locations: [".claude/skills/old-skill", ".agents/skills/old-skill"]`

#### Scenario: Configured extension does not need locations

- **WHEN** skill `my-skill` is classified as `lifecycle: "configured"`
- **THEN** the classified extension entry does not need to carry locations (configured extensions have known paths via settings)

## ADDED Requirements

### Requirement: Lint stale detection uses the workspace classifier

The `skills-artifacts-clean` lint rule SHALL use the workspace classifier to identify stale (unmanaged) skills instead of inline per-agent detection logic. An artifact is stale if and only if the classifier classifies it as `lifecycle: "unmanaged"`.

#### Scenario: Stale artifact detected via classifier

- **WHEN** skill `orphaned-tool` exists in `.claude/skills/orphaned-tool`
- **AND** the classifier classifies `orphaned-tool` as `lifecycle: "unmanaged"`
- **THEN** the lint rule SHALL report a stale finding for `orphaned-tool`

#### Scenario: Universal directory artifact detected as stale

- **WHEN** skill `old-shared` exists in `.agents/skills/old-shared`
- **AND** no agent declares `old-shared` as configured or enabled
- **AND** the classifier classifies `old-shared` as `lifecycle: "unmanaged"`
- **THEN** the lint rule SHALL report a stale finding for `old-shared`

#### Scenario: Universal directory artifact not stale when claimed

- **WHEN** skill `active-shared` exists in `.agents/skills/active-shared`
- **AND** at least one agent declares `active-shared` in settings
- **AND** the classifier classifies `active-shared` as `lifecycle: "configured"`
- **THEN** the lint rule SHALL NOT report a stale finding for `active-shared`

### Requirement: Lint stale findings suggest axm prune

Lint advisory messages for stale skill artifacts SHALL suggest `axm prune` or `axm skills prune <name>` as the remediation action.

#### Scenario: Advisory message references prune command

- **WHEN** the lint rule reports a stale finding for skill `legacy-tool`
- **THEN** the advisory message SHALL include a suggestion to run `axm prune` or `axm skills prune legacy-tool`
