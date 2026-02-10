## MODIFIED Requirements

### Requirement: Settings schema validates .axm/settings.json files

The schema SHALL validate settings files with the following top-level fields:

| Field    | Type     | Required | Description                             |
| -------- | -------- | -------- | --------------------------------------- |
| `scope`  | string   | No       | Default scope for resolving/publishing  |
| `agents` | string[] | No       | List of agent IDs to sync extensions to |
| `skills` | object   | No       | Map of skill name to SkillSettingsEntry |

Skill names SHALL be simple names (e.g., `my-skill`), not FQN patterns.

SkillSettingsEntry SHALL be one of:

- String: Registry FQN shorthand (e.g., `@scope/skill-name` or `@scope/skill-name@1.0.0`)
- Object with `_tag: "GitHub"`: GitHub source with owner, repo, optional ref and path
- Object with `_tag: "Local"`: Local source with path

#### Scenario: Valid settings with skills at root

- **WHEN** parsing:
  ```json
  {
    "skills": {
      "my-skill": "@wayne/my-skill@^1.0.0"
    }
  }
  ```
- **THEN** validation succeeds and skills map is accessible at root level

#### Scenario: Valid settings with GitHub source

- **WHEN** parsing:
  ```json
  {
    "skills": {
      "grappling-hook": {
        "_tag": "GitHub",
        "owner": "wayne-industries",
        "repo": "skills"
      }
    }
  }
  ```
- **THEN** validation succeeds and source is typed as GitHub variant

#### Scenario: Valid settings with Local source

- **WHEN** parsing:
  ```json
  {
    "skills": {
      "dev-skill": {
        "_tag": "Local",
        "path": "./my-skills/dev-skill"
      }
    }
  }
  ```
- **THEN** validation succeeds and source is typed as Local variant

#### Scenario: Valid empty settings

- **WHEN** parsing `{}`
- **THEN** validation succeeds with all fields undefined

## REMOVED Requirements

### Requirement: Extensions object structure

**Reason**: Flattened to root-level skills for simplicity; matches lockfile structure.

**Migration**: Move `extensions.skills` entries to root `skills` field.

### Requirement: FQN pattern for skill names

**Reason**: Skill names are simple identifiers; source determines registry scope.

**Migration**: Use simple skill names (e.g., `my-skill` not `@scope/my-skill`) as keys.

### Requirement: Version specifier strings

**Reason**: Settings now store full source reference, not just version; version in source if needed.

**Migration**: Use SkillSettingsEntry union type; version included in Registry FQN if desired.
