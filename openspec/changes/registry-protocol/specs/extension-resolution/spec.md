## MODIFIED Requirements

### Requirement: Resolution Function

The resolution module SHALL provide a function that accepts an input string and options, returning an array of extension references. Resolution dispatches through the `SourceProviders` service (via `yield* SourceProviders`).

#### Scenario: Resolve with default options

- **WHEN** `resolveExtension("@wayne/grappling-hook")` is called without options
- **THEN** the function returns an Effect containing `ExtensionRef[]`

#### Scenario: Resolve with type filter

- **WHEN** `resolveExtension("@wayne/grappling-hook", { types: ["skill"] })` is called
- **THEN** only skill-type extensions are returned

#### Scenario: Resolve with source filter

- **WHEN** `resolveExtension("owner/repo", { sources: ["github"] })` is called
- **THEN** only GitHub sources are queried (GitLab is skipped)

### Requirement: Input Syntax - AXM Name

The resolution module SHALL recognize fully qualified AXM names in `@scope/name` format and resolve them via registry sources.

#### Scenario: Fully qualified AXM name

- **WHEN** the input is `@wayne/grappling-hook`
- **THEN** the module performs registry resolution via the `SourceProviders` service

#### Scenario: AXM name with version

- **WHEN** the input is `@wayne/grappling-hook@^1.0.0`
- **THEN** the module resolves the name with the version constraint passed as a semver range to the registry provider

### Requirement: AXM Name Resolution Levels

The resolution module SHALL resolve AXM names through registry sources configured via `getSources()`, replacing the previous project/global/placeholder lookup.

#### Scenario: Registry resolution via source providers

- **WHEN** resolving `@wayne/skill`
- **THEN** the module queries configured registry sources via `SourceProviders.resolve` with scope routing

#### Scenario: Registry not configured

- **WHEN** resolving `@wayne/skill` and no registry sources are configured
- **THEN** the registry guard is invoked (prompt in interactive, error in non-interactive)

### Requirement: Input Syntax - Ambiguous Pattern

The resolution module SHALL disambiguate `a/b` patterns using the merged sources list from `getSources()` instead of a hardcoded try-order.

#### Scenario: Ambiguous pattern matches local path

- **WHEN** the input is `skills/my-skill` and that path exists on filesystem
- **THEN** the module resolves as a local path

#### Scenario: Ambiguous pattern matches AXM name

- **WHEN** the input is `wayne/grappling-hook` and `@wayne/grappling-hook` exists in `.axm/skills/`
- **THEN** the module resolves as the installed AXM extension

#### Scenario: Ambiguous pattern falls back to configured sources

- **WHEN** the input is `owner/repo` and no local path or AXM name matches
- **THEN** the module queries git-hosting sources from `getSources()` in array order (not hardcoded GitHub-first)

#### Scenario: Ambiguous pattern with multiple source matches

- **WHEN** the input is `owner/repo` and it exists on both GitHub and GitLab
- **THEN** the module returns multiple `ExtensionRef` entries for user selection

### Requirement: ExtensionRef Result Schema

The resolution module SHALL return results conforming to the evolved ExtensionRef schema with `source`, `location`, and `version` fields replacing `path` and `registry`.

#### Scenario: Required fields present

- **WHEN** resolution succeeds
- **THEN** the result contains `type`, `source` (SourceInput), `location` (materialized URL), and `version` (Option)

#### Scenario: Registry-sourced ref includes version

- **WHEN** resolving from a registry source
- **THEN** `version` is `Some` with the resolved semver version

#### Scenario: Git-sourced ref has no version

- **WHEN** resolving from a git source
- **THEN** `version` is `None`
