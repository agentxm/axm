## ADDED Requirements

### Requirement: Extensions-current check reports available updates

The `extensions-current` doctor check SHALL compare each installed registry extension's version against available versions in the registry and emit findings for extensions that are not current.

The check SHALL depend on `extensions-installed`. If `extensions-installed` fails, this check SHALL be skipped.

#### Scenario: Extension with minor/patch update available

- **WHEN** a configured extension has installed version `1.2.3`
- **AND** the registry has version `1.4.0` available that satisfies the declared constraint
- **THEN** the check SHALL emit a finding with id `extensions-current.update-available`
- **AND** severity `info`
- **AND** subject `{ kind: "extension", ref: "@owner/type/name" }`

#### Scenario: Extension with major update available

- **WHEN** a configured extension has installed version `1.2.3`
- **AND** the registry has version `3.0.0` available (higher major version)
- **THEN** the check SHALL emit a finding with id `extensions-current.major-update-available`
- **AND** severity `info`

#### Scenario: All extensions are current

- **WHEN** all configured extensions are at their latest matching version
- **THEN** the check SHALL emit no findings
- **AND** the check status SHALL be `pass`

#### Scenario: Skip when extensions-installed fails

- **WHEN** the `extensions-installed` check has status `fail`
- **THEN** the `extensions-current` check SHALL be skipped
- **AND** the skip reason SHALL reference `extensions-installed`

### Requirement: Extensions-current findings are info severity only

All findings emitted by the `extensions-current` check SHALL have `info` severity. The check SHALL NOT emit `warn` or `error` findings.

This means the check SHALL NOT affect `healthy` status or process exit code.

#### Scenario: Check does not break healthy status

- **WHEN** the `extensions-current` check emits findings for available updates
- **THEN** the overall report `healthy` field SHALL remain `true` (assuming no other checks fail)
- **AND** the check status SHALL be `pass` (info findings do not change status to warn or fail)

### Requirement: Extensions-current findings include update action

Each finding emitted by the `extensions-current` check SHALL include an `action` pointing to the `axm update` command for the specific extension.

#### Scenario: Finding action references update command

- **WHEN** a finding is emitted for `@acme/skills/code-review`
- **THEN** the finding's `action.command` SHALL be `axm update @acme/skills/code-review`

### Requirement: Extensions-current check only evaluates registry extensions

The `extensions-current` check SHALL only evaluate extensions with registry sources. Extensions with local, git, or other non-registry sources SHALL be excluded from currency evaluation.

#### Scenario: Non-registry extension is excluded

- **WHEN** a configured extension has a local or git source
- **THEN** the check SHALL NOT emit any finding for that extension

#### Scenario: Registry extension is evaluated

- **WHEN** a configured extension has a registry source (`@owner/type/name`)
- **THEN** the check SHALL fetch its `ExtensionIndex` and compare versions
