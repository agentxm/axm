## ADDED Requirements

### Requirement: Remove extension from pack manifest

`axm packs remove <pack> <extension>` SHALL remove an extension from the specified pack's `axm-pack.json` manifest.

This is a manifest edit only — it SHALL NOT uninstall any extensions from the workspace.

#### Scenario: Remove specific extension

- **WHEN** user runs `axm packs remove frontend-tools @acme/code-review`
- **AND** `@acme/code-review` is in the pack's `skills` section
- **THEN** `@acme/code-review` is removed from the pack manifest's `skills` section

#### Scenario: Extension not in pack

- **WHEN** user runs `axm packs remove frontend-tools @acme/nonexistent`
- **AND** `@acme/nonexistent` is not in the pack manifest
- **THEN** the command fails with a `CliError` indicating the extension is not in the pack

### Requirement: Glob pattern expansion for remove

When the extension argument contains a glob pattern, the system SHALL expand it against extensions in the pack manifest.

#### Scenario: Glob matches multiple extensions in pack

- **WHEN** user runs `axm packs remove my-pack "effect-*"`
- **AND** the pack manifest contains `@acme/effect-basics` and `@acme/effect-streams` in `skills`
- **THEN** both are removed from the manifest

#### Scenario: Glob matches no extensions in pack

- **WHEN** user runs `axm packs remove my-pack "nonexistent-*"`
- **AND** no extensions in the pack manifest match the pattern
- **THEN** the command fails with a `CliError` indicating no extensions matched

### Requirement: Pack must exist

`axm packs remove` SHALL fail if the specified pack does not exist locally.

#### Scenario: Pack not found

- **WHEN** user runs `axm packs remove nonexistent-pack @acme/code-review`
- **AND** no pack named `nonexistent-pack` exists
- **THEN** the command fails with a `CliError` indicating the pack was not found
