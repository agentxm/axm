## MODIFIED Requirements

### Requirement: Settings service provides getScope query

The system SHALL provide a `getScope` method that reads settings from disk and returns the effective scope.

#### Scenario: Scope configured

- **WHEN** settings contains `namespace: "@acme"`
- **THEN** `getScope()` returns `"@acme"`

#### Scenario: Scope not configured

- **WHEN** settings does not contain a `scope` field
- **THEN** `getScope()` returns the default scope `"@community"`

## ADDED Requirements

### Requirement: Settings service provides getSources query

The system SHALL provide a `getSources` method that returns the merged source configuration list (project, global, built-in).

#### Scenario: Sources from project settings

- **WHEN** project settings has `sources: [{ "name": "local", "source": "registry", "location": "/reg" }]`
- **THEN** `getSources()` returns the project source merged with global and built-in sources

#### Scenario: No sources configured

- **WHEN** no settings have a `sources` field
- **THEN** `getSources()` returns only built-in defaults (github, gitlab, bitbucket)

#### Scenario: Result cached for workspace lifetime

- **WHEN** `getSources()` is called multiple times
- **THEN** the three-layer merge is performed once and cached

### Requirement: Settings service provides getSourceByName query

The system SHALL provide a `getSourceByName` method that looks up a source by name from the merged list.

#### Scenario: Source found

- **WHEN** `getSourceByName("local")` is called and a source named `local` exists
- **THEN** it returns `Some(sourceConfig)`

#### Scenario: Source not found

- **WHEN** `getSourceByName("nonexistent")` is called
- **THEN** it returns `None`

### Requirement: Settings service provides getRegistrySources query

The system SHALL provide a `getRegistrySources` method that returns only registry-type sources, optionally filtered by scope.

#### Scenario: All registry sources

- **WHEN** `getRegistrySources(None)` is called
- **THEN** all sources with `source: "registry"` from the merged list are returned

#### Scenario: Scope-filtered registry sources

- **WHEN** `getRegistrySources(Some("@corp"))` is called
- **THEN** only registry sources whose `scopes` includes `@corp` are returned (or catch-all sources if no scope-matched sources exist)

#### Scenario: No registry sources

- **WHEN** no registry sources are configured
- **THEN** `getRegistrySources()` returns an empty list

### Requirement: Settings service provides addSource mutation

The system SHALL provide an `addSource` method for persisting new source configurations (used by the registry guard).

#### Scenario: Add registry source

- **WHEN** `addSource({ "name": "local", "source": "registry", "location": "/path" })` is called
- **THEN** the source is appended to the project settings `sources` array and written to disk

#### Scenario: Concurrent addSource calls serialized

- **WHEN** two fibers concurrently call `addSource`
- **THEN** both sources appear in the final settings (serialized by semaphore)

### Requirement: Settings schema evolves sources field

The settings schema SHALL evolve `sources` from a per-provider-key object to an array of discriminated `SourceConfig` entries.

#### Scenario: New schema format

- **WHEN** settings contains `"sources": [{ "name": "corp", "source": "registry", "location": "/reg", "namespaces": ["@corp"] }]`
- **THEN** schema validation succeeds

#### Scenario: Old schema format rejected

- **WHEN** settings contains `"sources": { "registry": [{ "path": "/reg" }] }` (old format)
- **THEN** schema validation fails
