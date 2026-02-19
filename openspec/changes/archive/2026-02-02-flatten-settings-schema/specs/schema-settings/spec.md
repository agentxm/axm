## MODIFIED Requirements

### Requirement: Settings schema validates .axm/settings.json files

The schema SHALL validate settings files with the following top-level fields:

| Field         | Type     | Required | Description                                         |
| ------------- | -------- | -------- | --------------------------------------------------- |
| `scope`       | string   | No       | Default scope for resolving/publishing (@community) |
| `sources`     | object   | No       | Source configuration                                |
| `agents`      | string[] | No       | List of agent IDs to sync extensions to             |
| `skills`      | object   | No       | Desired skills by FQN to version specifier          |
| `commands`    | object   | No       | Desired commands by FQN to version specifier        |
| `packs`       | object   | No       | Desired packs by FQN to version specifier           |
| `mcp-servers` | object   | No       | Desired MCP servers by FQN to version specifier     |

#### Scenario: Valid empty settings

- **WHEN** parsing `{}`
- **THEN** validation succeeds with all fields undefined

#### Scenario: Valid settings with scope

- **WHEN** parsing `{ "namespace": "@myorg" }`
- **THEN** validation succeeds and scope is accessible

#### Scenario: Valid settings with skills at root

- **WHEN** parsing `{ "skills": { "@wayne/grappling-hook": "^1.0.0" } }`
- **THEN** validation succeeds and skills map is accessible at root level

#### Scenario: Valid settings with all extension types at root

- **WHEN** parsing:
  ```json
  {
    "skills": { "@wayne/grappling-hook": "^1.0.0" },
    "commands": { "@wayne/batcomputer-sync": "^1.0.0" },
    "packs": { "@wayne/utility-belt": "^1.0.0" },
    "mcp-servers": { "@wayne/batcomputer": "^2.0.0" }
  }
  ```
- **THEN** validation succeeds and all extension maps are accessible at root level

## REMOVED Requirements

### Requirement: Extensions configuration schema

**Reason**: Extension types moved to root level, wrapper object no longer needed.
**Migration**: Move `extensions.skills` to `skills`, `extensions.commands` to `commands`, etc.
