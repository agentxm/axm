## ADDED Requirements

### Requirement: Settings schema validates .axm/settings.json files

The schema SHALL validate settings files with the following top-level fields:

| Field        | Type   | Required | Description                                         |
| ------------ | ------ | -------- | --------------------------------------------------- |
| `scope`      | string | No       | Default scope for resolving/publishing (@community) |
| `sources`    | object | No       | Source configuration                                |
| `agents`     | object | No       | Agent configuration                                 |
| `extensions` | object | No       | Desired extensions by type                          |

#### Scenario: Valid empty settings

- **WHEN** parsing `{}`
- **THEN** validation succeeds with all fields undefined

#### Scenario: Valid settings with scope

- **WHEN** parsing `{ "scope": "@myorg" }`
- **THEN** validation succeeds and scope is accessible

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

The `agents` field SHALL validate agent configurations:

| Agent ID      | Default Skills Path          |
| ------------- | ---------------------------- |
| `claude-code` | `.claude/skills` (project)   |
| `cursor`      | `.cursor/skills` (project)   |
| `windsurf`    | `.windsurf/skills` (project) |
| `codex`       | `.codex/skills` (project)    |
| `copilot`     | `.github/skills` (project)   |
| `gemini`      | `.gemini/skills` (project)   |
| `vscode`      | `.vscode/skills` (project)   |
| `opencode`    | `.opencode/skills` (project) |

Each agent MAY configure paths per extension type.

To disable an agent, remove it from the configuration entirely.

#### Scenario: Valid agent with custom path

- **WHEN** parsing:
  ```json
  {
    "agents": {
      "codex": {
        "skills": { "path": "~/.codex/extensions/skills" }
      }
    }
  }
  ```
- **THEN** validation succeeds and codex.skills.path is accessible

### Requirement: Extensions configuration schema

The `extensions` field SHALL validate extension declarations by type:

```json
{
  "extensions": {
    "skills": { "@wayne/grappling-hook": "^1.0.0" },
    "commands": { "@wayne/batcomputer-sync": "^1.0.0" },
    "packs": { "@wayne/utility-belt": "^1.0.0" },
    "mcp-servers": { "@wayne/batcomputer": "^2.0.0" }
  }
}
```

Extension names SHALL match the `@<scope>/<name>` pattern.
Version specifiers SHALL be strings (semver ranges like `^1.0.0`, `~2.1.0`, `1.x`, `*`).

#### Scenario: Valid extensions configuration

- **WHEN** parsing settings with skills, commands, packs, and mcp-servers
- **THEN** validation succeeds and all extension entries are accessible

#### Scenario: Invalid extension name

- **WHEN** parsing `{ "extensions": { "skills": { "grappling-hook": "^1.0.0" } } }`
- **THEN** validation fails with error indicating invalid extension name pattern

### Requirement: JSON schema generated for settings.json

The system SHALL generate a JSON Schema file at `__generated__/settings.schema.json` from the Effect schema.

#### Scenario: JSON schema matches Effect schema

- **WHEN** running schema generation
- **THEN** `settings.schema.json` is created with matching structure and constraints
