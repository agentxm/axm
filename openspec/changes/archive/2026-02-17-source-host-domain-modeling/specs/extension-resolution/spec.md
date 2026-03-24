## MODIFIED Requirements

### Requirement: Resolution Function

The resolution module SHALL no longer provide `resolveExtension`. Resolution produces `Source` values (via `resolveSource`), not extension references. Extension discovery is exclusively the provider's responsibility via `SourceHostProviders.find()`.

Callers that previously used `resolveExtension(input, options)` SHALL use:

1. `resolveSource(input)` → `Source`
2. `sourceHostProviders.find(source, findOptions)` → `SourceExtensionRef[]`

#### Scenario: Resolution produces Source, discovery is separate

- **WHEN** a caller needs to find extensions from an input string
- **THEN** they call `resolveSource(input)` to get a `Source`, then `sourceHostProviders.find(source, options)` to discover extensions

#### Scenario: No type/source filter on resolveSource

- **WHEN** `resolveSource` is called
- **THEN** it returns a `Source` without type or source filtering (filtering moves to `FindOptions` on the provider)

### Requirement: Input Syntax - Local Path

The resolution module SHALL recognize local filesystem paths and resolve them to `LocalSource` values.

#### Scenario: Relative path with dot-slash

- **WHEN** the input is `./path/to/skills`
- **THEN** `resolveSource` produces a `LocalSource` with `path` resolved relative to the working directory

#### Scenario: Absolute POSIX path

- **WHEN** the input is `/home/user/skills`
- **THEN** `resolveSource` produces a `LocalSource` with the absolute path

### Requirement: Input Syntax - Home Directory Path

The resolution module SHALL recognize home directory paths starting with `~` and resolve them to `LocalSource` values.

#### Scenario: Home directory path with tilde

- **WHEN** the input is `~/skills/my-skill`
- **THEN** `resolveSource` produces a `LocalSource` with `~` expanded to the user's home directory

### Requirement: Input Syntax - AXM Name

The resolution module SHALL recognize fully qualified AXM names in `@scope/name` format and resolve them to `RegistrySource` values (with host config from settings).

#### Scenario: Fully qualified AXM name

- **WHEN** the input is `@wayne/grappling-hook`
- **THEN** `resolveSource` produces a `RegistrySource` with `namespace: "@wayne"`, `name: "grappling-hook"`, and host config from matched registry

#### Scenario: AXM name with version

- **WHEN** the input is `@wayne/grappling-hook@^1.0.0`
- **THEN** `resolveSource` produces a `RegistrySource` with `versionConstraint: Some("^1.0.0")`

### Requirement: Input Syntax - Bare Name

The resolution module SHALL recognize bare names (no `/`) and resolve them using the implied scope from settings.

#### Scenario: Bare name with implied scope configured

- **WHEN** the input is `grappling-hook` and settings has `namespace: "@wayne"`
- **THEN** `resolveSource` resolves `@wayne/grappling-hook` as a `RegistrySource`

#### Scenario: Bare name without implied scope

- **WHEN** the input is `grappling-hook` and no scope is configured in settings
- **THEN** `resolveSource` fails or returns empty (no match)

### Requirement: Input Syntax - Explicit Source

The resolution module SHALL recognize explicit source prefixes in `source:owner/repo` format and resolve them to the corresponding `Source` variant.

#### Scenario: GitHub explicit source

- **WHEN** the input is `github:wayne-industries/skills`
- **THEN** `resolveSource` produces a `GitHubSource` without checking other sources

#### Scenario: Explicit source with path and ref

- **WHEN** the input is `github:wayne-industries/mono/skills/grappling-hook@v1.0.0`
- **THEN** `resolveSource` produces a `GitHubSource` with `subPath: Some("skills/grappling-hook")` and `ref: Some("v1.0.0")`

### Requirement: Input Syntax - URL

The resolution module SHALL recognize URLs and resolve them to the appropriate `Source` variant via config-driven hostname matching and provider `match()`.

#### Scenario: GitHub HTTPS URL

- **WHEN** the input is `https://github.com/owner/repo`
- **THEN** `resolveSource` produces a `GitHubSource` via hostname matching against configured sources

#### Scenario: SSH URL

- **WHEN** the input is `git@github.com:owner/repo.git`
- **THEN** `resolveSource` produces a `GitHubSource` via hostname matching

### Requirement: Input Syntax - Ambiguous Pattern

The resolution module SHALL disambiguate `a/b` patterns using the merged sources list.

#### Scenario: Ambiguous pattern matches local path

- **WHEN** the input is `skills/my-skill` and that path exists on filesystem
- **THEN** `resolveSource` produces a `LocalSource`

#### Scenario: Ambiguous pattern falls back to configured sources

- **WHEN** the input is `owner/repo` and no local path matches
- **THEN** `resolveSource` queries git-hosting sources from configured sources in array order

### Requirement: Resolution Order

The resolution module SHALL attempt resolution steps in a specific order, stopping at the first match.

#### Scenario: Local path takes precedence

- **WHEN** the input is `./skills` (a local path that exists)
- **THEN** `resolveSource` returns immediately without checking AXM names or sources

#### Scenario: AXM name takes precedence over ambiguous

- **WHEN** the input is `@wayne/skill` (fully qualified)
- **THEN** `resolveSource` performs registry resolution without treating it as ambiguous

### Requirement: Error Handling

The resolution module SHALL return typed `AppError` errors (replacing `ResolutionError`) with recovery guidance.

#### Scenario: Invalid input format

- **WHEN** the input cannot be parsed as any recognized pattern
- **THEN** `resolveSource` fails with `AppError` with an appropriate error code

#### Scenario: No config matches

- **WHEN** a URL input has no matching configured source
- **THEN** `resolveSource` fails with `AppError` indicating no configured source matches

## REMOVED Requirements

### Requirement: ExtensionRef Result Schema

**Reason**: Resolution no longer produces `ExtensionRef`. The resolution module's `ExtensionRef` and `ExtensionMetadata` types are removed. Extension discovery is handled by `SourceHostProviders.find()`, which returns `SourceExtensionRef` (defined in `sources/types.ts`).

**Migration**: All consumers of the resolution `ExtensionRef` MUST be migrated to use `resolveSource()` + `SourceHostProviders.find()` and consume `SourceExtensionRef` from the source domain model.

### Requirement: Type Inference

**Reason**: Type inference from file patterns (SKILL.md → skill, axm-command.json → command) is the provider's responsibility, not resolution's. Providers perform discovery and type inference in their `find()` implementation.

**Migration**: File pattern scanning logic moves into provider `find()` implementations (already the case for git hosting and local providers).

### Requirement: AXM Name Resolution Levels

**Reason**: Replaced by the two-tier name resolution in `resolve-source` (lockfile lookup → configured skills). The registry guard behavior is unchanged but invoked through the new resolution path.

**Migration**: Callers use `resolveSource("@scope/name")` which handles registry config lookup and scope routing via the resolved `RegistrySource`.

### Requirement: Path Resolution

**Reason**: Directory scanning for extension files is the provider's responsibility via `find()`. When `resolveSource` produces a `LocalSource`, the caller passes it to `SourceHostProviders.find()` for discovery.

**Migration**: `LocalSourceHostProvider.find()` handles directory scanning, replacing the resolution module's path scanning logic.
