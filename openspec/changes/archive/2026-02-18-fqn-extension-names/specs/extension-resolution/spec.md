## MODIFIED Requirements

### Requirement: Input Syntax - AXM Name

The resolution module SHALL recognize fully qualified AXM names in `@scope/type-plural/name` format and resolve them to `RegistrySource` values (with host config from settings).

#### Scenario: Fully qualified AXM name

- **WHEN** the input is `@wayne/skills/grappling-hook`
- **THEN** `resolveSource` produces a `RegistrySource` with `namespace: "@wayne"`, `name: "grappling-hook"`, and host config from matched registry

#### Scenario: AXM name with version

- **WHEN** the input is `@wayne/skills/grappling-hook@^1.0.0`
- **THEN** `resolveSource` produces a `RegistrySource` with `versionConstraint: Some("^1.0.0")`

#### Scenario: Two-segment AXM name not recognized

- **WHEN** the input is `@wayne/grappling-hook` (no type segment)
- **THEN** `resolveSource` does NOT produce a `RegistrySource`
- **AND** the input falls through to other resolution steps

#### Scenario: Scope-only input

- **WHEN** the input is `@wayne`
- **THEN** `resolveSource` produces a `RegistrySource` with scope `@wayne`, no type, no name (browse mode)

#### Scenario: Scope+type input

- **WHEN** the input is `@wayne/skills`
- **THEN** `resolveSource` produces a `RegistrySource` with scope `@wayne`, type `skills`, no name (browse mode)

### Requirement: Input Syntax - Bare Name

The resolution module SHALL recognize bare names (no `/`) and resolve them using the implied scope from settings. The extension type SHALL be determined by the command context (e.g., `axm skills install` implies `skills`).

#### Scenario: Bare name with implied scope configured

- **WHEN** the input is `grappling-hook` and settings has `namespace: "@wayne"`
- **AND** the command context implies type `skills`
- **THEN** `resolveSource` resolves `@wayne/skills/grappling-hook` as a `RegistrySource`

#### Scenario: Bare name without implied scope

- **WHEN** the input is `grappling-hook` and no scope is configured in settings
- **THEN** `resolveSource` fails or returns empty (no match)
