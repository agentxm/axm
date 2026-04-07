## ADDED Requirements

### Requirement: compatiblePackages stored in VersionEntry at publish time

When an extension is published with a `compatiblePackages` field in its manifest, the registry SHALL include the `compatiblePackages` array in the `VersionEntry` written to the extension's `index.json`. The stored form SHALL be an array of canonical purl strings.

#### Scenario: Extension published with compatiblePackages

- **WHEN** a skill with `compatiblePackages: ["pkg:npm/react", "pkg:pypi/django"]` is published
- **THEN** the `VersionEntry` in `index.json` SHALL include `compatiblePackages: ["pkg:npm/react", "pkg:pypi/django"]`

#### Scenario: Extension published without compatiblePackages

- **WHEN** a skill is published without a `compatiblePackages` field
- **THEN** the `VersionEntry` in `index.json` SHALL NOT include a `compatiblePackages` key

### Requirement: All extension types propagate compatiblePackages to VersionEntry

The publish pipeline for skills, commands, and MCP servers SHALL extract `compatiblePackages` from the decoded manifest and include it in the `VersionEntry` when present. Pack publish SHALL NOT propagate `compatiblePackages`.

#### Scenario: Skill publish propagates compatiblePackages

- **WHEN** a skill manifest has `compatiblePackages: ["pkg:npm/react"]`
- **THEN** the skill publish handler SHALL include `compatiblePackages` in the `VersionEntry`

#### Scenario: Command publish propagates compatiblePackages

- **WHEN** a command manifest has `compatiblePackages: ["pkg:npm/express"]`
- **THEN** the command publish handler SHALL include `compatiblePackages` in the `VersionEntry`

#### Scenario: MCP server publish propagates compatiblePackages

- **WHEN** an MCP server manifest has `compatiblePackages: ["pkg:cargo/tokio"]`
- **THEN** the MCP server publish handler SHALL include `compatiblePackages` in the `VersionEntry`

#### Scenario: Pack publish does not propagate compatiblePackages

- **WHEN** a pack is published
- **THEN** the pack publish handler SHALL NOT include a `compatiblePackages` field in the `VersionEntry`

### Requirement: Invalid purls rejected at publish time

Each purl string in `compatiblePackages` SHALL be validated during manifest schema decoding. Invalid purl strings SHALL cause publish to fail with a schema validation error before the extension is stored.

#### Scenario: Invalid purl blocks publish

- **WHEN** a skill manifest contains `compatiblePackages: ["not-a-valid-purl"]`
- **THEN** publish SHALL fail with a schema validation error
- **AND** the extension SHALL NOT be stored in the registry

#### Scenario: Valid purls pass publish validation

- **WHEN** a skill manifest contains `compatiblePackages: ["pkg:npm/react", "pkg:npm/%40angular/core"]`
- **THEN** publish validation SHALL succeed
- **AND** the extension SHALL be stored with the purls in its `VersionEntry`

### Requirement: VersionEntry schema includes optional compatiblePackages

The `VersionEntry` schema SHALL include an optional `compatiblePackages` field as an array of purl strings (decoded to `PackageUrlParts`). The field SHALL use `Schema.optional` to match the codebase convention for optional fields.

#### Scenario: VersionEntry with compatiblePackages decoded

- **WHEN** an `index.json` contains a version entry with `compatiblePackages: ["pkg:npm/react"]`
- **THEN** decoding the `VersionEntry` SHALL produce `compatiblePackages` as `ReadonlyArray<PackageUrlParts>`

#### Scenario: VersionEntry without compatiblePackages decoded

- **WHEN** an `index.json` contains a version entry without a `compatiblePackages` key
- **THEN** decoding the `VersionEntry` SHALL produce `compatiblePackages` as `undefined`
