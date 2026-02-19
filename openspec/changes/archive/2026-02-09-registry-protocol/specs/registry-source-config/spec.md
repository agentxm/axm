## ADDED Requirements

### Requirement: Named source configuration

Source configurations SHALL be an array of named entries in settings, discriminated by `source` field:

- `name`: unique identifier matching `^[a-z0-9][a-z0-9.-]*$`
- `source`: discriminator (`"github"`, `"gitlab"`, `"bitbucket"`, `"azurerepos"`, `"registry"`)
- `url`: base URL for git hosting providers
- `location`: registry path or URL (registry sources only)
- `scopes`: optional scope filter (registry sources only)

#### Scenario: Registry source with scope filter

- **WHEN** settings contains `{ "name": "corp", "source": "registry", "location": "/registries/corp", "namespaces": ["@corp"] }`
- **THEN** the source is only consulted when resolving extensions in the `@corp` scope

#### Scenario: Registry source without scope filter

- **WHEN** settings contains `{ "name": "local", "source": "registry", "location": "~/my-registry" }`
- **THEN** the source is a catch-all registry consulted for any scope (when no scope-matched source exists)

#### Scenario: GitHub source with custom URL

- **WHEN** settings contains `{ "name": "github.acme", "source": "github", "url": "https://github.acme.corp" }`
- **THEN** GitHub resolution uses `https://github.acme.corp` as the base URL

#### Scenario: Invalid source name

- **WHEN** a source name contains uppercase letters or special characters
- **THEN** schema validation fails

### Requirement: Three-layer source resolution

Source configurations SHALL be resolved through three layers with name-based deduplication: project (highest), global, built-in (lowest).

#### Scenario: Project sources take precedence

- **WHEN** project settings has source `{ "name": "github", "source": "github", "url": "https://github.acme.corp" }`
- **THEN** the project entry shadows the built-in `github` default

#### Scenario: Global fills gaps

- **WHEN** project has no sources and global has `{ "name": "corp-registry", "source": "registry", "location": "/shared/registry" }`
- **THEN** the global source appears in the merged list

#### Scenario: Built-in defaults

- **WHEN** no project or global sources override the built-in names
- **THEN** the merged list includes built-in defaults: `github` (github.com), `gitlab` (gitlab.com), `bitbucket` (bitbucket.org)

#### Scenario: Name-based deduplication

- **WHEN** project has source named `github` and built-in has source named `github`
- **THEN** only the project entry appears in the merged list

#### Scenario: Merge preserves order

- **WHEN** project has sources `[A, B]` and global has `[C, D]` (no name overlap)
- **THEN** the merged list is `[A, B, C, D, ...built-ins]`

### Requirement: No built-in registry source

The system SHALL NOT include a built-in registry source. Users MUST configure registry sources explicitly until the remote registry provider is implemented.

#### Scenario: Default sources have no registry

- **WHEN** no user configuration exists
- **THEN** `getRegistrySources()` returns an empty list

### Requirement: Location normalization

Registry source locations SHALL be normalized at parse time:

- `~/...` expands home directory
- `./...` resolves relative to workspace root
- `/...` used as-is (absolute path)
- `file://...` strips scheme, uses path
- `https://...` preserved for future remote provider

#### Scenario: Tilde expansion

- **WHEN** location is `~/my-registry`
- **THEN** it is normalized to the absolute path under the user's home directory

#### Scenario: Relative path resolution

- **WHEN** location is `./local-registry` and workspace root is `/projects/myapp`
- **THEN** it is normalized to `/projects/myapp/local-registry`

#### Scenario: File URL stripped

- **WHEN** location is `file:///registries/main`
- **THEN** it is normalized to `/registries/main`

### Requirement: Scope routing for registry sources

Within registry resolution, sources SHALL be selected by scope routing with mutually exclusive sets.

#### Scenario: Scope-matched sources used exclusively

- **WHEN** resolving `@corp/tool` and a registry source has `namespaces: ["@corp"]`
- **THEN** only scope-matched sources are queried (catch-all sources are not tried)

#### Scenario: Catch-all sources used when no scope match

- **WHEN** resolving `@community/tool` and no registry source has `scopes` including `@community`
- **THEN** registry sources with no `scopes` field are queried

#### Scenario: Scope-matched source 404 does not fall through to catch-all

- **WHEN** resolving `@corp/tool`, the scope-matched source returns 404, and a catch-all source has the extension
- **THEN** resolution fails (catch-all is not tried when scope-matched sources exist)

#### Scenario: Multiple scope-matched sources fall through on 404

- **WHEN** resolving `@corp/tool` and two sources match the `@corp` scope
- **THEN** the first source is queried; if 404, the second scope-matched source is queried

### Requirement: Ambiguous input resolution uses merged sources

For ambiguous patterns (e.g., `owner/repo`), resolution SHALL iterate the merged sources list filtered to git-hosting types, replacing the hardcoded GitHub-first order.

#### Scenario: Default order preserved

- **WHEN** no user config exists and input is `owner/repo`
- **THEN** resolution tries github, gitlab, bitbucket in built-in order

#### Scenario: User-customized order

- **WHEN** project settings places `gitlab` before `github` in sources
- **THEN** ambiguous patterns try GitLab first

#### Scenario: Multiple sources of same type

- **WHEN** both `github` (github.com) and `github.acme` (github.acme.corp) are configured
- **THEN** both are tried in array order for ambiguous patterns

#### Scenario: Explicit prefix bypasses ordering

- **WHEN** input is `github:owner/repo`
- **THEN** resolution dispatches directly to GitHub without consulting the ordering

### Requirement: Registry configuration guard

Commands depending on a registry SHALL call a guard that detects missing registry configuration and guides the user.

#### Scenario: Interactive — no registry configured

- **WHEN** `skills fork` is called, no registry sources are configured, and the session is interactive
- **THEN** the guard prompts for a local registry path and persists it as `{ "name": "local", "source": "registry", "location": "<path>" }` to project settings

#### Scenario: Non-interactive — no registry configured

- **WHEN** `skills install @scope/name` is called with `--yes` and no registry sources are configured
- **THEN** the guard fails with `RegistryNotConfiguredError` explaining how to add a registry source

#### Scenario: Registry already configured

- **WHEN** a registry-dependent command is called and at least one registry source exists
- **THEN** the guard passes without prompting

#### Scenario: Guard changes visible to subsequent calls

- **WHEN** the guard persists a new registry source to settings
- **THEN** subsequent `SourceProviders` calls in the same handler see the new source (via lazy workspace reads)
