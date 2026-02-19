## Requirements

### Requirement: PackExtensionRef carries pack dependencies

`PackExtensionRefBase` SHALL include `skills`, `commands`, and `mcpServers` fields on the `pack` property containing the pack's extension dependencies structured by type.

The `pack` property SHALL have the shape:

```typescript
readonly pack: {
  readonly name: string;
  readonly skills: Readonly<Record<string, string>>;
  readonly commands: Readonly<Record<string, string>>;
  readonly mcpServers: Readonly<Record<string, string>>;
};
```

Keys in each map SHALL be fully qualified names including the type segment (e.g., `@namespace/skills/name`, `@namespace/commands/name`, `@namespace/mcp-servers/name`). Values SHALL be version constraints (e.g., `"^1.0.0"`, `"*"`).

#### Scenario: Registry pack ref includes dependencies from registry manifest

- **WHEN** a pack is discovered via `sources.find()` from a registry
- **AND** the registry index has dependencies for that pack version
- **THEN** the returned `PackExtensionRef` SHALL have `pack.skills`, `pack.commands`, and `pack.mcpServers` populated from the registry data

#### Scenario: Pack ref with no dependencies in registry

- **WHEN** a pack is discovered via `sources.find()` from a registry
- **AND** the registry index has no dependencies for that pack version
- **THEN** the returned `PackExtensionRef` SHALL have `pack.skills`, `pack.commands`, and `pack.mcpServers` as empty maps (`{}`)

### Requirement: Pack publish populates registry dependencies

When publishing a pack, the publish operation SHALL write the pack manifest's skill, command, and mcp-server dependencies into the `VersionEntry.dependencies` field.

Dependency keys SHALL use the format `@namespace/<type-plural>/<name>` (e.g., `@acme/skills/code-review`, `@acme/commands/formatter`, `@acme/mcp-servers/db`). Values SHALL be the version constraint from the pack manifest.

#### Scenario: Pack with skill dependencies published

- **WHEN** a pack manifest contains `skills: { "@acme/code-review": "^1.0.0", "@acme/linting": "^2.0.0" }`
- **THEN** the `VersionEntry.dependencies` SHALL contain `{ "@acme/skills/code-review": "^1.0.0", "@acme/skills/linting": "^2.0.0" }`

#### Scenario: Pack with mixed dependency types published

- **WHEN** a pack manifest contains `skills: { "@acme/code-review": "^1.0.0" }`, `commands: { "@acme/formatter": "^1.5.0" }`, and `mcp-servers: { "@acme/db": "*" }`
- **THEN** the `VersionEntry.dependencies` SHALL contain `{ "@acme/skills/code-review": "^1.0.0", "@acme/commands/formatter": "^1.5.0", "@acme/mcp-servers/db": "*" }`

#### Scenario: Pack with no dependencies published

- **WHEN** a pack manifest has no skills, commands, or mcp-servers
- **THEN** the `VersionEntry.dependencies` SHALL be empty or omitted

### Requirement: Registry dependencies decoded to structured pack dependencies

When mapping a `RegistryExtensionManifest` with type `"pack"` to a `PackExtensionRef`, the `toExtensionRef` function SHALL parse dependency keys to reconstruct the `pack.skills`, `pack.commands`, and `pack.mcpServers` maps.

#### Scenario: Dependency keys parsed by type prefix

- **WHEN** `RegistryExtensionManifest.dependencies` contains `{ "@acme/skills/code-review": "^1.0.0", "@acme/commands/formatter": "^1.5.0" }`
- **THEN** `PackExtensionRef.pack.skills` SHALL be `{ "@acme/skills/code-review": "^1.0.0" }`, `pack.commands` SHALL be `{ "@acme/commands/formatter": "^1.5.0" }`, and `pack.mcpServers` SHALL be `{}`

#### Scenario: Malformed dependency key rejected

- **WHEN** a dependency key does not match the `@namespace/<type-plural>/<name>` format
- **THEN** the key SHALL be ignored with a warning (not a hard failure)
