## MODIFIED Requirements

### Requirement: Pack lockfile section

The lockfile SHALL have a separate top-level `packs` section. Pack lock entries SHALL include:

- `type`: `"registry"`
- `scope`: string (with `@` prefix)
- `name`: string (without scope)
- `resolvedVersion`: string (exact semver)
- `integrity`: string (SRI format `sha512-<base64>`)
- `sourceName`: string (registry source name)
- `installedAt`: ISO 8601 date string
- `updatedAt`: ISO 8601 date string
- `resolvedSkills`: record of `@scope/name` to exact resolved version
- `resolvedCommands`: record of `@scope/name` to exact resolved version
- `resolvedMcpServers`: record of `@scope/name` to exact resolved version

#### Scenario: Pack lock entry with resolved extensions

- **WHEN** pack `@acme/frontend-pack` version `1.0.0` is installed with skills `@acme/code-review@1.2.0` and `@acme/linting@2.1.0`
- **THEN** the lockfile `packs` section contains an entry with `resolvedSkills: { "@acme/code-review": "1.2.0", "@acme/linting": "2.1.0" }`

#### Scenario: Packs section is separate from skills

- **WHEN** the lockfile is read
- **THEN** pack entries are in the `packs` section, not mixed with skill entries
