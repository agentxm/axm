# registry-source-config Specification (Delta)

## Purpose

Adds a built-in default registry source and removes the registry configuration guard.

## MODIFIED Requirements

### Requirement: Built-in default registry source

Replaces: "No built-in registry source"

The system SHALL include a built-in registry source named `"default"` pointing at the default registry URL. The built-in registry URL SHALL be overridable via the `AXM_REGISTRY_URL` environment variable.

#### Scenario: Default sources include registry

- **WHEN** no user configuration exists
- **THEN** `getRegistrySources()` returns one entry: the built-in default registry

#### Scenario: Built-in registry is first in merge order

- **WHEN** no user configuration exists
- **THEN** the merged sources list is: `default` (registry), `github`, `gitlab`, `bitbucket`

#### Scenario: User overrides default registry by name

- **WHEN** project settings has source `{ "name": "default", "source": "registry", "location": "http://localhost:4000" }`
- **THEN** the project entry shadows the built-in `default` registry

#### Scenario: AXM_REGISTRY_URL overrides built-in

- **WHEN** `AXM_REGISTRY_URL=http://localhost:4000` is set and no user configuration exists
- **THEN** the built-in default registry source uses `http://localhost:4000`

#### Scenario: Visual indicator for non-default registry

- **WHEN** `AXM_REGISTRY_URL` is set to a value different from the hardcoded default
- **THEN** the CLI SHALL log a warning: "Using registry: <url>" at startup

### Requirement: Three-layer source resolution

#### Scenario: Built-in defaults (MODIFIED)

- **WHEN** no project or global sources override the built-in names
- **THEN** the merged list includes built-in defaults: `default` (registry), `github` (github.com), `gitlab` (gitlab.com), `bitbucket` (bitbucket.org)

## REMOVED Requirements

### Requirement: Registry configuration guard

The registry configuration guard is removed entirely. With a built-in registry source always present, `getRegistrySources()` always returns at least one entry, making the guard dead code.

Removed scenarios:

- Interactive — no registry configured (prompt for local path)
- Non-interactive — no registry configured (fail with error)
- Registry already configured (pass-through)
- Guard changes visible to subsequent calls
