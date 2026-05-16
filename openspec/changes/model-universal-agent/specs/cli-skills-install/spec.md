## MODIFIED Requirements

### Requirement: Skill install materializes configured agent targets

`axm skills install` SHALL materialize installed skills into the always-on
universal skills target and each configured agent that supports skills. The
universal target SHALL be represented as agent id `universal` in the skill
lockfile entry's `agents[]` list and SHALL NOT be persisted to
`settings.json`.

#### Scenario: Empty settings agents still materializes universal target

- **WHEN** `settings.agents` is empty
- **AND** `axm skills install @acme/skills/reviewer` runs successfully
- **THEN** AXM SHALL materialize `.agents/skills/reviewer`
- **AND** the skill lock entry SHALL include `agents: ["universal"]`
- **AND** `settings.json` SHALL NOT include `universal` in `agents`

#### Scenario: Configured agent and universal target both materialize

- **WHEN** `settings.agents` is `["claude-code"]`
- **AND** `axm skills install @acme/skills/reviewer` runs successfully
- **THEN** AXM SHALL materialize `.agents/skills/reviewer`
- **AND** AXM SHALL materialize `.claude/skills/reviewer`
- **AND** the skill lock entry SHALL include both `universal` and
  `claude-code` in `agents[]`

## REMOVED Requirements

### Requirement: Universal skill artifact lockfile metadata

**Reason**: The universal skills directory is now modeled as the synthetic
`universal` agent target. Per-target artifact integrity metadata is out of scope
for this change and should be reintroduced uniformly for all agents if needed.

**Migration**: Existing skill lock entries that contain `universalArtifact` are
normalized by adding `universal` to `agents[]`. Future writes omit
`universalArtifact`.
