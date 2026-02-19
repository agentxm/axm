## ADDED Requirements

### Requirement: Canonical FQN format

A Fully Qualified Name (FQN) SHALL use the three-segment format `@<namespace>/<type-plural>/<name>` where:

- `namespace`: `@` followed by one or more alphanumeric characters, hyphens, or underscores
- `type-plural`: one of `skills`, `packs`, `mcp-servers`
- `name`: one or more alphanumeric characters, hyphens, or underscores

The canonical regex pattern SHALL be: `/^@[\w-]+\/(skills|packs|mcp-servers)\/[\w-]+$/`

#### Scenario: Valid skill FQN

- **WHEN** validating `@acme/skills/code-review`
- **THEN** validation succeeds with namespace `@acme`, type `skills`, name `code-review`

#### Scenario: Valid pack FQN

- **WHEN** validating `@acme/packs/frontend-tools`
- **THEN** validation succeeds with namespace `@acme`, type `packs`, name `frontend-tools`

#### Scenario: Valid MCP server FQN

- **WHEN** validating `@acme/mcp-servers/db-connector`
- **THEN** validation succeeds with namespace `@acme`, type `mcp-servers`, name `db-connector`

#### Scenario: Two-segment name rejected

- **WHEN** validating `@acme/code-review` (no type segment)
- **THEN** validation fails

#### Scenario: Invalid type segment rejected

- **WHEN** validating `@acme/commands/formatter` (unrecognized type)
- **THEN** validation fails

#### Scenario: Missing namespace prefix rejected

- **WHEN** validating `acme/skills/code-review` (no `@`)
- **THEN** validation fails

### Requirement: FQN parsing utility

The system SHALL provide `parseFqn` and `parseFqnOrThrow` functions that decompose an FQN string into its constituent parts.

`parseFqn` SHALL return `Effect<Fqn, CliError>`. `parseFqnOrThrow` SHALL return `Fqn` or throw.

The `Fqn` type SHALL have fields:

- `namespace: string` — the namespace including `@` prefix (e.g., `"@acme"`)
- `type: "skills" | "packs" | "mcp-servers"` — the plural type segment
- `name: string` — the extension name

#### Scenario: Parse valid FQN

- **WHEN** calling `parseFqn("@acme/skills/code-review")`
- **THEN** the result is `{ namespace: "@acme", type: "skills", name: "code-review" }`

#### Scenario: Parse invalid FQN returns CliError

- **WHEN** calling `parseFqn("@acme/code-review")`
- **THEN** the result is a `CliError` with code `INVALID_FQN`

#### Scenario: parseFqnOrThrow throws on invalid input

- **WHEN** calling `parseFqnOrThrow("not-an-fqn")`
- **THEN** an error is thrown

### Requirement: FQN formatting utility

The system SHALL provide a `formatFqn` function that constructs an FQN string from its parts.

#### Scenario: Format from parts

- **WHEN** calling `formatFqn({ namespace: "@acme", type: "skills", name: "code-review" })`
- **THEN** the result is `"@acme/skills/code-review"`

#### Scenario: Format round-trips with parse

- **WHEN** calling `formatFqn(parseFqnOrThrow(input))` for any valid FQN `input`
- **THEN** the result equals `input`

### Requirement: FQN schema validation

`FullyQualifiedNameSchema` SHALL validate strings against the three-segment FQN pattern. `FQN_PATTERN` SHALL be the canonical regex for the three-segment format.

#### Scenario: Schema accepts valid FQN

- **WHEN** decoding `"@acme/skills/code-review"` with `FullyQualifiedNameSchema`
- **THEN** decoding succeeds

#### Scenario: Schema rejects two-segment name

- **WHEN** decoding `"@acme/code-review"` with `FullyQualifiedNameSchema`
- **THEN** decoding fails with a validation error

### Requirement: FQN module location

FQN parsing and formatting utilities SHALL be located in `extensions/fqn.ts` and exported from the `extensions` barrel. `FQN_PATTERN` and `FullyQualifiedNameSchema` SHALL remain in `extensions/common.ts` (updated to three-segment pattern).

#### Scenario: Import from extensions module

- **WHEN** code needs to parse or format FQNs
- **THEN** it imports `parseFqn`, `parseFqnOrThrow`, or `formatFqn` from the `extensions` module
