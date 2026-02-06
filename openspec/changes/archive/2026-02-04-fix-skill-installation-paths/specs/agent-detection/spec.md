## MODIFIED Requirements

### Requirement: Agent Configuration Schema

Agent configuration SHALL use nested skills configuration with explicit projectDir and globalDir properties.

```typescript
interface AgentSkillsConfig {
  readonly projectDir: string; // Required, relative path
  readonly globalDir: Option.Option<string>; // Option type, absolute path
}

interface AgentConfig {
  readonly id: AgentId; // Union type of known agents
  readonly name: string; // Human-readable name
  readonly skills: AgentSkillsConfig; // Required skills configuration
}

type AgentRegistry = Record.ReadonlyRecord<AgentId, AgentConfig>;
```

#### Scenario: Required projectDir

- **WHEN** accessing an agent's project skills directory
- **THEN** the directory SHALL be available via `agent.skills.projectDir`
- **AND** the value SHALL always be defined (not optional)

#### Scenario: Optional globalDir uses Effect Option

- **WHEN** accessing an agent's global skills directory
- **THEN** the directory SHALL be available via `agent.skills.globalDir`
- **AND** the value SHALL be `Option.some(path)` for agents supporting global installation
- **AND** the value SHALL be `Option.none()` for agents without global support

#### Scenario: No detectPath property

- **WHEN** accessing agent configuration
- **THEN** there SHALL be no `detectPath` property on `AgentConfig`
- **AND** detection logic SHALL be a separate effectful function

### Requirement: Agent Registry Storage

Agent configurations SHALL be stored in a Record keyed by agent ID for O(1) lookup.

#### Scenario: Registry as Record

- **WHEN** looking up an agent by ID
- **THEN** the lookup SHALL use `AGENTS[id]` with O(1) time complexity
- **AND** the registry type SHALL be `Record.ReadonlyRecord<AgentId, AgentConfig>`

#### Scenario: Lookup returns Option

- **WHEN** calling `getAgentById(id)`
- **THEN** the function SHALL return `Option.some(agent)` for known agents
- **AND** the function SHALL return `Option.none()` for unknown agents

### Requirement: Corrected Installation Paths

All agent configurations SHALL use `/skills` subdirectories matching the Agent Skills specification.

#### Scenario: Claude Code paths

- **WHEN** installing skills for Claude Code agent
- **THEN** projectDir SHALL be `.claude/skills`
- **AND** globalDir SHALL be `~/.claude/skills` (or `$CLAUDE_CONFIG_DIR/skills`)

#### Scenario: Cursor paths

- **WHEN** installing skills for Cursor agent
- **THEN** projectDir SHALL be `.cursor/skills`
- **AND** globalDir SHALL be `~/.cursor/skills`

#### Scenario: Codex paths

- **WHEN** installing skills for Codex agent
- **THEN** projectDir SHALL be `.codex/skills`
- **AND** globalDir SHALL be `~/.codex/skills` (or `$CODEX_HOME/skills`)

#### Scenario: Windsurf paths

- **WHEN** installing skills for Windsurf agent
- **THEN** projectDir SHALL be `.windsurf/skills`
- **AND** globalDir SHALL be `~/.codeium/windsurf/skills`

#### Scenario: Continue paths

- **WHEN** installing skills for Continue agent
- **THEN** projectDir SHALL be `.continue/skills`
- **AND** globalDir SHALL be `~/.continue/skills`

### Requirement: Separate Detection Function

Agent detection SHALL be implemented as a separate effectful function, not embedded in configuration.

#### Scenario: Detection function signature

- **WHEN** detecting if an agent is installed
- **THEN** the function SHALL be `detectAgent(agent: AgentConfig): Effect<boolean, DetectionError, FileSystem>`
- **AND** the function SHALL NOT be a property of `AgentConfig`

#### Scenario: Concurrent detection

- **WHEN** detecting all installed agents
- **THEN** the function SHALL be `detectAgents(): Effect<AgentConfig[], DetectionError, FileSystem>`
- **AND** detection SHALL run concurrently across all agents

### Requirement: Agent Module Location

Agent types and registry SHALL be in a dedicated `agents/` module at the experimental level.

#### Scenario: Module structure

- **WHEN** importing agent configuration
- **THEN** the import path SHALL be `@axm.sh/core/experimental/agents`
- **AND** the module SHALL NOT be nested under `skills/`

#### Scenario: Module exports

- **WHEN** importing from `agents/` module
- **THEN** types SHALL be available: `AgentConfig`, `AgentId`, `AgentSkillsConfig`, `AgentRegistry`
- **AND** registry SHALL be available: `AGENTS`, `getAgentById`, `getAllAgents`, `getAgentIds`
- **AND** detection SHALL be available: `detectAgent`, `detectAgents`, `DetectionError`

## ADDED Requirements

### Requirement: Extended Agent Support

The registry SHALL include all agents from the vercel-labs/skills reference implementation.

#### Scenario: Reference agent coverage

- **WHEN** listing supported agents
- **THEN** the registry SHALL include at minimum: claude-code, cursor, codex, windsurf, continue, cline, opencode, goose, amp, roo-code, gemini-cli, github-copilot, replit

#### Scenario: New agent: OpenCode

- **WHEN** installing skills for OpenCode agent
- **THEN** projectDir SHALL be `.opencode/skills`
- **AND** globalDir SHALL be `~/.config/opencode/skills` (or `$XDG_CONFIG_HOME/opencode/skills`)

#### Scenario: New agent: Goose

- **WHEN** installing skills for Goose agent
- **THEN** projectDir SHALL be `.goose/skills`
- **AND** globalDir SHALL be `~/.config/goose/skills` (or `$XDG_CONFIG_HOME/goose/skills`)

#### Scenario: New agent: Cline

- **WHEN** installing skills for Cline agent
- **THEN** projectDir SHALL be `.cline/skills`
- **AND** globalDir SHALL be `~/.cline/skills`

#### Scenario: New agent: Replit

- **WHEN** installing skills for Replit agent
- **THEN** projectDir SHALL be `.agents/skills`
- **AND** globalDir SHALL be `Option.none()` (no global support)

## REMOVED Requirements

### Requirement: Optional skillsDir with detectPath fallback

**Reason**: The fallback pattern `agent.skillsDir ?? path.join(agent.detectPath, "skills")` used unexpanded tilde paths, causing installation bugs. Making `skills.projectDir` required eliminates this class of errors.

**Migration**: All agent configurations now have explicit `skills.projectDir` values. Code using the fallback pattern must use `agent.skills.projectDir` directly.

### Requirement: detectPath property on AgentConfig

**Reason**: Detection logic varies significantly per agent (single path check vs multiple paths, file vs directory, environment variables). Embedding detection in config conflates pure data with effectful operations.

**Migration**: Detection is now a separate function `detectAgent(agent)` that uses agent-specific logic based on `agent.id`. Import from `@axm.sh/core/experimental/agents`.

### Requirement: SUPPORTED_AGENTS array

**Reason**: Array storage requires O(n) lookup. Record keyed by ID provides O(1) lookup and type-safe keys.

**Migration**: Use `AGENTS` Record instead. For iteration, use `getAllAgents()` or `Record.values(AGENTS)`.
