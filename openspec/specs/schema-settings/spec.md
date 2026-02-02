## ADDED Requirements

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

Extension names SHALL match the `@<scope>/<name>` pattern.
Version specifiers SHALL be strings (semver ranges like `^1.0.0`, `~2.1.0`, `1.x`, `*`).

#### Scenario: Valid empty settings

- **WHEN** parsing `{}`
- **THEN** validation succeeds with all fields undefined

#### Scenario: Valid settings with scope

- **WHEN** parsing `{ "scope": "@myorg" }`
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

#### Scenario: Invalid extension name

- **WHEN** parsing `{ "skills": { "grappling-hook": "^1.0.0" } }`
- **THEN** validation fails with error indicating invalid extension name pattern

### Requirement: Sources configuration schema

The `sources` field SHALL validate source configurations:

| Source Type   | Fields          | Default                              |
| ------------- | --------------- | ------------------------------------ |
| `github`      | `url`: string   | `{ "url": "https://github.com" }`    |
| `gitlab`      | `url`: string   | `{ "url": "https://gitlab.com" }`    |
| `bitbucket`   | `url`: string   | `{ "url": "https://bitbucket.org" }` |
| `azuredevops` | `url`: string   | `{ "url": "https://dev.azure.com" }` |
| `git`         | (none)          | `{}`                                 |
| `registry`    | `url` or `path` | (none)                               |

The `registry` source MAY be an array for multiple registries.

To disable a source, remove it from the configuration entirely.

#### Scenario: Valid sources with custom GitHub URL

- **WHEN** parsing `{ "sources": { "github": { "url": "https://github.acme.corp" } } }`
- **THEN** validation succeeds and github.url is accessible

#### Scenario: Multiple registries

- **WHEN** parsing:
  ```json
  {
    "sources": {
      "registry": [
        { "path": "./.axm/registry" },
        { "url": "https://registry.agentxm.ai" }
      ]
    }
  }
  ```
- **THEN** validation succeeds and registry is an array of configurations

### Requirement: Agents configuration schema

The `agents` field SHALL be an array of agent ID strings. Valid agent IDs are:

| Agent ID      | Name           |
| ------------- | -------------- |
| `claude-code` | Claude Code    |
| `cursor`      | Cursor         |
| `windsurf`    | Windsurf       |
| `codex`       | Codex CLI      |
| `copilot`     | GitHub Copilot |
| `gemini`      | Gemini CLI     |
| `vscode`      | VS Code        |
| `opencode`    | OpenCode       |

To disable an agent, remove it from the array.

#### Scenario: Valid agents list

- **WHEN** parsing `{ "agents": ["claude-code", "cursor", "codex"] }`
- **THEN** validation succeeds and agents is an array of strings

#### Scenario: Empty agents list

- **WHEN** parsing `{ "agents": [] }`
- **THEN** validation succeeds and agents is an empty array

### Requirement: JSON schema generated for settings.json

The system SHALL generate a JSON Schema file at `__generated__/settings.schema.json` from the Effect schema.

#### Scenario: JSON schema matches Effect schema

- **WHEN** running schema generation
- **THEN** `settings.schema.json` is created with matching structure and constraints
