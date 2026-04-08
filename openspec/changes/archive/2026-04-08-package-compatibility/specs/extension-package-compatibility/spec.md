## ADDED Requirements

### Requirement: compatiblePackages field on extension manifests

All extension types (skills, commands, MCP servers) SHALL support an optional `compatiblePackages` field on their manifest schema. The field SHALL be an array of Package URL (purl, ECMA-427) strings. Each purl string SHALL identify a package ecosystem and package name, with an optional version or VERS version constraint.

When `compatiblePackages` is absent or omitted, the extension has no declared package compatibility — it is compatible with any project context. When present, each entry declares a package the extension is designed for.

#### Scenario: Skill manifest with compatiblePackages

- **WHEN** a skill manifest contains `compatiblePackages: ["pkg:npm/react", "pkg:npm/%40angular/core"]`
- **THEN** manifest validation SHALL succeed
- **AND** the decoded field SHALL contain two `PackageUrlParts` values with typed `type`, `namespace`, `name`, and `version` fields

#### Scenario: Command manifest with compatiblePackages

- **WHEN** a command manifest contains `compatiblePackages: ["pkg:pypi/django"]`
- **THEN** manifest validation SHALL succeed

#### Scenario: MCP server manifest with compatiblePackages

- **WHEN** an MCP server manifest contains `compatiblePackages: ["pkg:cargo/tokio"]`
- **THEN** manifest validation SHALL succeed

#### Scenario: Manifest without compatiblePackages

- **WHEN** a skill manifest omits the `compatiblePackages` field entirely
- **THEN** manifest validation SHALL succeed
- **AND** the decoded `compatiblePackages` SHALL be `undefined`

#### Scenario: Empty compatiblePackages array

- **WHEN** a manifest contains `compatiblePackages: []`
- **THEN** manifest validation SHALL succeed
- **AND** the decoded field SHALL be an empty array

### Requirement: Purl string validation at schema boundary

Each entry in `compatiblePackages` SHALL be validated as a valid purl string at schema decode time. Invalid purl strings SHALL cause schema validation to fail. The decoded form SHALL be a structured `PackageUrlParts` object with typed `type`, `namespace`, `name`, and `version` fields.

#### Scenario: Valid purl string decoded to parts

- **WHEN** `compatiblePackages` contains `"pkg:npm/react@18.2.0"`
- **THEN** decoding SHALL produce `PackageUrlParts` with `type: "npm"`, `name: "react"`, `version: "18.2.0"`

#### Scenario: Scoped npm purl decoded correctly

- **WHEN** `compatiblePackages` contains `"pkg:npm/%40angular/core"`
- **THEN** decoding SHALL produce `PackageUrlParts` with `type: "npm"`, `namespace: "%40angular"`, `name: "core"`

#### Scenario: Versionless purl decoded correctly

- **WHEN** `compatiblePackages` contains `"pkg:npm/react"`
- **THEN** decoding SHALL produce `PackageUrlParts` with `type: "npm"`, `name: "react"`, `version: undefined`

#### Scenario: Invalid purl string rejected

- **WHEN** `compatiblePackages` contains `"not-a-purl"`
- **THEN** schema validation SHALL fail with a descriptive error

#### Scenario: Purl round-trips through encode/decode

- **WHEN** a purl string is decoded to `PackageUrlParts` and encoded back to a string
- **THEN** the encoded string SHALL be the canonical purl form (e.g., `PKG:NPM/React` normalizes to `pkg:npm/react`)

### Requirement: Versionless purl is the recommended default

Extension authors SHALL be able to declare compatibility without version constraints. A versionless purl (e.g., `pkg:npm/react`) SHALL mean "any version of this package." Version constraints using VERS syntax (e.g., `pkg:npm/react@vers:npm/>=17.0.0`) or exact versions (e.g., `pkg:npm/react@18.2.0`) SHALL be accepted but are not required.

#### Scenario: Versionless declaration accepted

- **WHEN** an extension declares `compatiblePackages: ["pkg:npm/react"]`
- **THEN** the declaration SHALL be valid and mean "compatible with any version of react"

#### Scenario: VERS constraint accepted

- **WHEN** an extension declares `compatiblePackages: ["pkg:npm/react@vers:npm/>=17.0.0"]`
- **THEN** the declaration SHALL be valid

#### Scenario: Exact version accepted

- **WHEN** an extension declares `compatiblePackages: ["pkg:npm/react@18.2.0"]`
- **THEN** the declaration SHALL be valid and mean "compatible with exactly react 18.2.0"

### Requirement: Field placement on CommonManifestBaseFields

The `compatiblePackages` field SHALL be defined on `CommonManifestBaseFields` so it applies uniformly to all extension types. Extension packs SHALL NOT use this field — pack compatibility is derived from constituent extensions.

#### Scenario: Field shared across extension types

- **WHEN** a skill, command, or MCP server manifest includes `compatiblePackages`
- **THEN** all three SHALL validate using the same schema definition from `CommonManifestBaseFields`

#### Scenario: Pack manifest does not accept compatiblePackages

- **WHEN** a pack manifest includes a `compatiblePackages` field
- **THEN** the field SHALL be ignored (packs derive compatibility from their constituent extensions)
