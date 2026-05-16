## MODIFIED Requirements

### Requirement: Sync materializes skills for the universal target

`axm sync` SHALL materialize enabled skills for the always-on universal skills
target in addition to configured real agents. The universal target SHALL be
implicit and SHALL NOT depend on `settings.agents`.

#### Scenario: Sync materializes universal skills with no configured agents

- **WHEN** `settings.agents` is empty
- **AND** skill `reviewer` is enabled in settings and present on disk under
  `.axm/extensions/`
- **AND** `axm sync` runs
- **THEN** AXM SHALL materialize `.agents/skills/reviewer`
- **AND** AXM SHALL NOT write `universal` to `settings.json`

#### Scenario: Sync materializes universal and configured agent skills

- **WHEN** `settings.agents` is `["claude-code"]`
- **AND** skill `reviewer` is enabled in settings and present on disk under
  `.axm/extensions/`
- **AND** `axm sync` runs
- **THEN** AXM SHALL materialize `.agents/skills/reviewer`
- **AND** AXM SHALL materialize `.claude/skills/reviewer`

### Requirement: Pack expansion materializes universal skills

Pack-installed or pack-implied skills SHALL use the same skill materialization
target set as direct skills: the always-on universal target plus configured real
agents that support skills.

#### Scenario: Pack install materializes constituent skill universally

- **WHEN** a pack contains skill `reviewer`
- **AND** `settings.agents` is empty
- **AND** the pack is installed successfully
- **THEN** AXM SHALL materialize `.agents/skills/reviewer`

#### Scenario: Pack sync materializes constituent skill universally

- **WHEN** a configured pack contains skill `reviewer`
- **AND** the pack and skill are present on disk under `.axm/extensions/`
- **AND** `axm sync` runs
- **THEN** AXM SHALL materialize `.agents/skills/reviewer`
