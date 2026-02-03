### Requirement: Settings schema validates .axm/settings.json files

The schema SHALL validate settings files with the following top-level fields:

| Field    | Type                   | Required | Description                             |
| -------- | ---------------------- | -------- | --------------------------------------- |
| `scope`  | string                 | No       | Default scope for resolving/publishing  |
| `agents` | string[]               | No       | List of agent IDs to sync extensions to |
| `skills` | Record<string, string> | No       | Map of skill name to source string      |

Skill names SHALL be simple names (e.g., `my-skill`), not FQN patterns.

Source strings SHALL follow the format defined in the `extension-sources` capability.

#### Scenario: Valid settings with registry source

- **WHEN** parsing:
  ```json
  {
    "skills": {
      "my-skill": "@acme/my-skill@^1.0.0"
    }
  }
  ```
- **THEN** validation succeeds and skills map contains the source string

#### Scenario: Valid settings with GitHub source

- **WHEN** parsing:
  ```json
  {
    "skills": {
      "grappling-hook": "github:wayne-industries/skills/grappling-hook"
    }
  }
  ```
- **THEN** validation succeeds and skills map contains the source string

#### Scenario: Valid settings with local source

- **WHEN** parsing:
  ```json
  {
    "skills": {
      "dev-skill": "local:./my-skills/dev-skill"
    }
  }
  ```
- **THEN** validation succeeds and skills map contains the source string

#### Scenario: Valid empty settings

- **WHEN** parsing `{}`
- **THEN** validation succeeds with all fields undefined
