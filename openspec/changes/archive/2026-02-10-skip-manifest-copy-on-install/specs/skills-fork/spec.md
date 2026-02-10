## MODIFIED Requirements

### Requirement: ForkSkillOperation executor

The `fork-skill` executor SHALL copy source files to `.axm/extensions/` under the `src/` subdirectory and generate an `axm-skill.json` manifest at the extension root.

#### Scenario: Skill content written to src subdirectory

- **WHEN** forking skill `code-review` to `@acme/code-review`
- **THEN** skill content files are copied to `.axm/extensions/@acme/skills/code-review/src/`

#### Scenario: Manifest generated at extension root

- **WHEN** forking a skill
- **THEN** `axm-skill.json` is created at `.axm/extensions/@acme/skills/code-review/axm-skill.json` with `name: "@scope/name"`, `version: "0.1.0"`, `agents` from workspace settings, and empty `dependencies`

#### Scenario: Manifest not inside src

- **WHEN** forking a skill
- **THEN** `axm-skill.json` SHALL NOT exist inside the `src/` subdirectory
