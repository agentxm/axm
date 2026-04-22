## MODIFIED Requirements

### Requirement: Agent list change reconciliation

When the `agents` list in `settings.json` changes, `axm sync` SHALL automatically adjust rendered files. When multiple declared agents resolve to the universal skills directory, the system SHALL treat that directory as a single reconciliation target — artifacts SHALL NOT be duplicated or removed redundantly.

#### Scenario: Agent added

- **WHEN** `gemini-cli` is added to the agents list
- **AND** `axm sync` is run
- **THEN** sync SHALL render all installed subagents for Gemini CLI (respecting each subagent's `agents` filter)

#### Scenario: Agent removed

- **WHEN** `cursor` is removed from the agents list
- **AND** `axm sync` is run
- **THEN** sync SHALL delete rendered files for Cursor (using lockfile `renderedFiles` paths)
- **AND** SHALL remove Cursor entries from the lockfile `renderedFiles` map

#### Scenario: Universal-dir agent removed while others remain

- **WHEN** `amp` is removed from the agents list
- **AND** `kimi-cli` remains in the agents list
- **AND** both resolve to the universal skills directory
- **AND** `axm sync` is run
- **THEN** sync SHALL NOT remove skill artifacts from `.agents/skills/` because another declared agent still uses that directory

#### Scenario: Last universal-dir agent removed

- **WHEN** `amp` is the only declared agent resolving to the universal skills directory
- **AND** `amp` is removed from the agents list
- **AND** `axm sync` is run
- **THEN** sync SHALL remove skill artifacts from `.agents/skills/` for disabled/orphaned skills per normal reconciliation rules
