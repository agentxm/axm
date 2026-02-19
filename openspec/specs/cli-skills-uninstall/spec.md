## MODIFIED Requirements

### Requirement: Ownership-aware skill removal

When uninstalling a skill, the handler SHALL check whether any installed pack still references the skill's FQN in its `resolvedSkills`. The FQN keys in `resolvedSkills` SHALL use the three-segment format (`@scope/skills/name`). If a pack still references it, the skill SHALL be removed from settings but kept in the lockfile and on disk.

#### Scenario: Skill removed when no pack references it

- **WHEN** user runs `axm skills uninstall review`
- **AND** skill "review" (`@acme/skills/code-review`) is not referenced by any pack's `resolvedSkills`
- **THEN** the skill SHALL be removed from settings, lockfile, and disk

#### Scenario: Skill kept on disk when pack still references it

- **WHEN** user runs `axm skills uninstall review`
- **AND** skill "review" (`@acme/skills/code-review`) is referenced by pack "starter"'s `resolvedSkills` with key `@acme/skills/code-review`
- **THEN** the skill SHALL be removed from `settings.json`
- **AND** the skill SHALL remain in the lockfile and on disk (pack still needs it)

#### Scenario: Skill kept on disk when multiple packs reference it

- **WHEN** user runs `axm skills uninstall review`
- **AND** `@acme/skills/code-review` is referenced by both pack "starter" and pack "pro" via `resolvedSkills` keys
- **THEN** the skill SHALL be removed from settings
- **AND** the skill SHALL remain in the lockfile and on disk
