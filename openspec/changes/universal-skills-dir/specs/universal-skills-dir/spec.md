## ADDED Requirements

### Requirement: Universal skills directory constant

The system SHALL define a constant `UNIVERSAL_SKILLS_DIR` with the value `.agents/skills` in the extensions constants module. This constant is the single source of truth for the universal skills directory path.

#### Scenario: Constant value

- **WHEN** code references `UNIVERSAL_SKILLS_DIR`
- **THEN** its value SHALL be `.agents/skills`

### Requirement: Derived universal directory check

The system SHALL provide a pure function `isUniversalSkillsDir(resolvedDir, workspaceRoot)` that returns `true` when the resolved directory path equals the universal skills directory resolved against the workspace root.

#### Scenario: Resolved dir matches universal location

- **WHEN** `isUniversalSkillsDir` is called with a resolved dir of `/projects/foo/.agents/skills` and workspace root `/projects/foo`
- **THEN** it SHALL return `true`

#### Scenario: Resolved dir is agent-specific

- **WHEN** `isUniversalSkillsDir` is called with a resolved dir of `/projects/foo/.claude/skills` and workspace root `/projects/foo`
- **THEN** it SHALL return `false`

#### Scenario: Agent config overrides default away from universal

- **WHEN** an agent's descriptor defaults to `.agents/skills`
- **AND** the agent's `resolveEffectiveSkillsDir` returns a different path due to agent-specific configuration
- **THEN** `isUniversalSkillsDir` called with the resolved path SHALL return `false`

#### Scenario: Agent config overrides default toward universal

- **WHEN** an agent's descriptor defaults to a non-universal path
- **AND** the agent's `resolveEffectiveSkillsDir` returns `.agents/skills` (resolved) due to agent-specific configuration
- **THEN** `isUniversalSkillsDir` called with the resolved path SHALL return `true`

### Requirement: Detection excludes universal-dir-only signals

Agent detection SHALL NOT count the universal skills directory as an agent-specific detection signal. An agent whose only filesystem footprint is the first path segment of the universal skills directory (`.agents`) SHALL NOT be considered detected.

#### Scenario: Agent with only universal dir is not detected

- **WHEN** detecting agents in a project directory
- **AND** agent `amp` has `skills.dir` of `.agents/skills` and no commands or subagents dirs
- **AND** `.agents/` exists on disk
- **THEN** `amp` SHALL NOT be detected

#### Scenario: Agent with universal dir plus agent-specific dir is detected

- **WHEN** detecting agents in a project directory
- **AND** an agent has `skills.dir` of `.agents/skills` and `commands.dir` of `.foo/commands`
- **AND** `.foo/` exists on disk
- **THEN** the agent SHALL be detected via its commands dir

#### Scenario: Agent with non-universal skills dir is detected normally

- **WHEN** detecting agents in a project directory
- **AND** agent `claude-code` has `skills.dir` of `.claude/skills`
- **AND** `.claude/` exists on disk
- **THEN** `claude-code` SHALL be detected

#### Scenario: Legacy home-dir detection unaffected

- **WHEN** detecting agents for a project
- **AND** `~/.<agent-id>` exists for an agent whose only descriptor dir is universal
- **THEN** the agent SHALL be detected via the legacy path

### Requirement: Lint stale-artifact check skips universal dir

The `workspace/skills-artifacts-clean` rule's stale arm SHALL skip artifacts in a declared agent's skills directory when that directory resolves to the universal skills location. The dangling arm (canonical source missing) SHALL still fire for universal-dir artifacts.

#### Scenario: Stale arm skipped for universal dir agent

- **WHEN** the stale arm iterates artifacts in a declared agent's skills dir
- **AND** that dir resolves to the universal skills location
- **AND** an artifact exists that is not backed by any declaration
- **THEN** the rule SHALL NOT emit a stale finding for that artifact

#### Scenario: Dangling arm still fires for universal dir

- **WHEN** the dangling arm checks an artifact in a declared agent's skills dir
- **AND** that dir resolves to the universal skills location
- **AND** the artifact's canonical source is missing
- **THEN** the rule SHALL emit a dangling finding

#### Scenario: Stale arm fires for agent-specific dir

- **WHEN** the stale arm iterates artifacts in a declared agent's skills dir
- **AND** that dir resolves to an agent-specific (non-universal) location
- **AND** an artifact exists that is not backed by any declaration
- **THEN** the rule SHALL emit a stale finding as before

### Requirement: Lint consistency check collapses universal dir agents

The `workspace/skills-artifacts-correct` rule SHALL treat all declared agents whose resolved skills dir is the universal location as a single check target for artifact presence. An enabled skill needs one artifact in the universal dir to satisfy all universal-dir agents.

#### Scenario: Multiple universal-dir agents satisfied by one artifact

- **WHEN** agents `amp` and `kimi-cli` are both declared
- **AND** both resolve to the universal skills dir
- **AND** skill `code-review` is enabled with one artifact at `.agents/skills/code-review`
- **THEN** the rule SHALL NOT emit missing-artifact findings for either agent

#### Scenario: Mixed universal and agent-specific dirs

- **WHEN** agents `amp` (universal dir) and `claude-code` (`.claude/skills`) are both declared
- **AND** skill `code-review` is enabled
- **AND** an artifact exists at `.agents/skills/code-review` but not at `.claude/skills/code-review`
- **THEN** the rule SHALL emit a missing-artifact finding for `claude-code` only

### Requirement: Install references universal dir constant

The skill install operation SHALL reference `UNIVERSAL_SKILLS_DIR` when deduplicating target directories. The dedup behavior (single symlink/copy per distinct resolved path) SHALL remain unchanged.

#### Scenario: Install dedup for universal dir agents

- **WHEN** installing a skill for agents `amp`, `kimi-cli`, and `replit`
- **AND** all three resolve to the universal skills dir
- **THEN** install SHALL create one symlink at `.agents/skills/<skill-name>`
- **AND** SHALL NOT create duplicate symlinks
