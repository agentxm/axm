## ADDED Requirements

> Historical note: this delta spec used the original `WorkspaceContext` name.
> The implemented API is now `WorkspaceReadModel`; the change slug is preserved
> for traceability.

### Requirement: WorkspaceContext exposes independent workspace state layers

The system SHALL provide a `WorkspaceContext` capability that exposes workspace state through `ctx.scope(scope)`. A scoped workspace context SHALL expose subject namespaces (`skills`, `commands`, `mcpServers`, `subagents`, `files`, `rules`, `packs`, `agents`), scoped raw `state` cells, scoped `sourceHosts`, scoped `profile`, and scoped `diagnostics`. Scope SHALL distinguish project state from user state.

#### Scenario: Extension layers are available by scope and type

- **WHEN** a consumer selects `ctx.scope("project")`
- **THEN** the scoped context SHALL expose declared, resolved, actual, installed, active, unmanaged, and ignored accessors under `skills`
- **AND** `skills.actual` SHALL return the skill-specific actual payload shape

#### Scenario: Agent layers are available by scope and agent id

- **WHEN** a consumer selects `ctx.scope("project")`
- **THEN** the scoped context SHALL expose declared, actual, detected, list, and known accessors under `agents`
- **AND** the context SHALL NOT expose a resolved layer for agents

### Requirement: WorkspaceContext is a read-only CLI read model

WorkspaceContext SHALL be the intended primary read model for CLI workspace state. A WorkspaceContext instance SHALL represent a read-only snapshot for one CLI command phase. It SHALL NOT write settings, write lockfiles, materialize files, execute plans, perform source-host resolution, or fetch registry data. Commands that need post-mutation state SHALL construct a fresh WorkspaceContext after the mutation phase.

#### Scenario: Post-mutation reads use a fresh context

- **WHEN** a command reads pre-state through WorkspaceContext
- **AND** the command later writes settings, lockfile data, or materialized files through an operation or manager
- **THEN** the original WorkspaceContext snapshot SHALL NOT be refreshed in place
- **AND** any post-mutation read SHALL use a newly constructed WorkspaceContext

### Requirement: Source-backed cells distinguish absent state from invalid state

Declared cells and settings source cells SHALL return `Option.none()` when settings are absent or do not mention the requested subject. Resolved cells and lockfile source cells SHALL return `Option.none()` when the lockfile is absent or does not mention the requested subject. Invalid settings SHALL fail with `SettingsReadError`. Invalid lockfile data SHALL fail with `LockfileReadError`.

#### Scenario: Missing settings is absent

- **WHEN** `.axm/settings.json` is missing
- **AND** a consumer queries `ctx.scope("project").skills.declared`
- **THEN** the cell SHALL succeed with `Option.none()`

#### Scenario: Invalid settings is not absent

- **WHEN** `.axm/settings.json` exists but is not valid settings data
- **AND** a consumer queries `ctx.scope("project").skills.declared`
- **THEN** the cell SHALL fail with a `SettingsReadError`

#### Scenario: Missing project lockfile is absent

- **WHEN** `axm-lock.yaml` is missing
- **AND** a consumer queries `ctx.scope("project").skills.resolved`
- **THEN** the cell SHALL succeed with `Option.none()`

#### Scenario: Invalid project lockfile is not absent

- **WHEN** `axm-lock.yaml` exists but is not valid lockfile data
- **AND** a consumer queries `ctx.scope("project").skills.resolved`
- **THEN** the cell SHALL fail with a `LockfileReadError`

#### Scenario: User lockfile is absent in v1

- **WHEN** a consumer queries `ctx.scope("user").state.lockfile`
- **THEN** the cell SHALL succeed with `Option.none()`

### Requirement: Source loading is independent

The context SHALL load settings, lockfile, and actual scanner state independently. Failure or corruption in one source SHALL NOT prevent cells for another source from reading their own state.

#### Scenario: Corrupt lockfile does not hide settings

- **WHEN** `.axm/settings.json` is valid
- **AND** `axm-lock.yaml` is corrupt
- **AND** a consumer queries `ctx.scope("project").skills.declared`
- **THEN** the declared cell SHALL return the settings-derived skill declarations

#### Scenario: Corrupt settings does not hide actual state

- **WHEN** `.axm/settings.json` is corrupt
- **AND** `.claude/skills/some-skill/SKILL.md` exists
- **AND** a consumer queries `ctx.scope("project").skills.actual`
- **THEN** the actual cell SHALL return the observed skill materialization

#### Scenario: Corrupt settings does not hide lockfile state

- **WHEN** `.axm/settings.json` is corrupt
- **AND** `axm-lock.yaml` is valid
- **AND** a consumer queries `ctx.scope("project").skills.resolved`
- **THEN** the resolved cell SHALL return the lockfile-derived skill records

### Requirement: Actual extension state is occurrence-shaped

Actual extension cells SHALL return observable materialization occurrences. The raw actual layer SHALL NOT deduplicate by extension type and name across distinct physical surfaces. Same-name entries from different agent directories, canonical AXM storage, external AXM storage, MCP config files, or agent config files SHALL remain distinct actual entries.

#### Scenario: Single agent-rendered skill is one actual skill

- **WHEN** `./.claude/skills/some-skill/SKILL.md` exists
- **AND** no other actual skill materialization for `some-skill` exists
- **THEN** `ctx.scope("project").skills.actual` SHALL contain exactly one actual entry named `some-skill`
- **AND** that entry SHALL have source path `./.claude/skills/some-skill/SKILL.md`
- **AND** that entry SHALL have skill detection origin `agent-skill-dir` for agent id `claude-code`

#### Scenario: Same skill in two agent directories is two actual skills

- **WHEN** `./.claude/skills/some-skill/SKILL.md` exists
- **AND** `./.codex/skills/some-skill/SKILL.md` exists
- **AND** no other actual skill materialization for `some-skill` exists
- **THEN** `ctx.scope("project").skills.actual` SHALL contain exactly two actual entries named `some-skill`
- **AND** one entry SHALL have skill detection origin `agent-skill-dir` for agent id `claude-code`
- **AND** one entry SHALL have skill detection origin `agent-skill-dir` for agent id `codex`

#### Scenario: Same skill in two agent directories and canonical AXM storage is three actual skills

- **WHEN** `./.claude/skills/some-skill/SKILL.md` exists
- **AND** `./.codex/skills/some-skill/SKILL.md` exists
- **AND** `./.axm/extensions/@owner/skills/src/some-skill/SKILL.md` exists
- **THEN** `ctx.scope("project").skills.actual` SHALL contain exactly three actual entries named `some-skill`
- **AND** one entry SHALL have skill detection origin `agent-skill-dir` for agent id `claude-code`
- **AND** one entry SHALL have skill detection origin `agent-skill-dir` for agent id `codex`
- **AND** one entry SHALL have skill detection origin `canonical-axm-skill`

#### Scenario: Same skill in two agent directories and external AXM storage is three actual skills

- **WHEN** `./.claude/skills/some-skill/SKILL.md` exists
- **AND** `./.codex/skills/some-skill/SKILL.md` exists
- **AND** `./.axm/extensions/external/skills/some-skill/SKILL.md` exists
- **THEN** `ctx.scope("project").skills.actual` SHALL contain exactly three actual entries named `some-skill`
- **AND** one entry SHALL have skill detection origin `agent-skill-dir` for agent id `claude-code`
- **AND** one entry SHALL have skill detection origin `agent-skill-dir` for agent id `codex`
- **AND** one entry SHALL have skill detection origin `external-axm-skill`

### Requirement: Actual entries carry stable occurrence identity and subject-specific origin

Each actual entry SHALL carry a stable occurrence identity derived from scope, extension type or agent id, subject-specific detection origin, and physical content or config location. Each actual entry SHALL carry exactly one detection origin whose concrete type is owned by that actual entry's subject module. Exact duplicate observations of the same physical occurrence SHALL collapse to one actual entry.

#### Scenario: Duplicate scanner observation does not duplicate one physical skill

- **WHEN** two scanner paths observe `./.claude/skills/some-skill/SKILL.md` as the same Claude Code skill materialization
- **THEN** `ctx.scope("project").skills.actual` SHALL contain one actual entry for that physical occurrence
- **AND** that entry SHALL have one stable occurrence identity

#### Scenario: Distinct physical skill paths do not share occurrence identity

- **WHEN** `./.claude/skills/some-skill/SKILL.md` exists
- **AND** `./.codex/skills/some-skill/SKILL.md` exists
- **THEN** the two actual entries for `some-skill` SHALL have different occurrence identities

### Requirement: Actual cells never fail in the error channel

Actual extension and agent cells SHALL succeed with the readable observable subset. Scanner partial failures SHALL be recorded as diagnostics warnings. Workspace-root path escape SHALL be rejected when the context provider is constructed, not by individual actual cells.

#### Scenario: Partial scanner failure records a warning

- **WHEN** one scanned skill directory cannot be read
- **AND** another scanned skill directory can be read
- **AND** a consumer queries `ctx.scope("project").skills.actual`
- **THEN** the actual cell SHALL return entries from the readable directory
- **AND** `ctx.scope("project").diagnostics` SHALL include a scanner warning for the unreadable directory

#### Scenario: Workspace root escape fails provider construction

- **WHEN** the workspace root configuration escapes the allowed root
- **THEN** constructing `WorkspaceContextLive` SHALL fail with `WorkspaceRootEscape`
- **AND** no per-cell actual query SHALL be required to discover the root escape

### Requirement: Resilient projections degrade through diagnostics

Installed, active, unmanaged, ignored, and detected projections SHALL catch per-source read failures they are designed to tolerate, publish warnings to scoped `diagnostics`, and return the state they can derive from the remaining layers. These projections SHALL NOT hide source read failures from the raw `state`, `declared`, or `resolved` cells. Extension projections SHALL derive direct managed rows from non-ignored declarations, implicit managed rows from installed pack dependency graphs, active rows from installed rows whose activation is enabled, unmanaged rows from unmatched actual occurrences after subject-specific ignored and claimed filters, and ignored rows from suppressed declared/resolved/actual candidates.

#### Scenario: Installed skills are managed inventory

- **WHEN** settings declare skill `managed-tool`
- **AND** `./.claude/skills/legacy-tool/SKILL.md` exists only as an actual skill materialization
- **AND** a consumer queries `ctx.scope("project").skills.installed`
- **THEN** the projection SHALL include an installed row for `managed-tool`
- **AND** the projection SHALL NOT include an installed row for `legacy-tool`

#### Scenario: Actual-only skills remain visible outside installed

- **WHEN** `./.claude/skills/legacy-tool/SKILL.md` exists only as an actual skill materialization
- **AND** a consumer queries `ctx.scope("project").skills.actual`
- **THEN** the actual cell SHALL include an actual entry for `legacy-tool`
- **AND** `ctx.scope("project").skills.unmanaged` SHALL include `legacy-tool` when it is not ignored or claimed by installed state or subject policy

#### Scenario: Pack-provided skill is implicit installed inventory

- **WHEN** settings declare pack `team-pack`
- **AND** the installed pack dependency graph resolves `team-pack` with member skill `review-tool`
- **AND** settings do not directly declare skill `review-tool`
- **AND** a consumer queries `ctx.scope("project").skills.installed`
- **THEN** the projection SHALL include an installed row for `review-tool`
- **AND** that row SHALL have installation origin `pack-member`
- **AND** that row SHALL have activation `enabled`

#### Scenario: Direct skill declaration wins over pack membership

- **WHEN** settings declare pack `team-pack`
- **AND** settings directly declare skill `review-tool`
- **AND** the installed pack dependency graph resolves `team-pack` with member skill `review-tool`
- **AND** a consumer queries `ctx.scope("project").skills.installed`
- **THEN** the projection SHALL include an installed row for `review-tool`
- **AND** that row SHALL have installation origin `direct`

#### Scenario: Actual-only pack does not install member skills

- **WHEN** `team-pack` exists only as an actual pack materialization
- **AND** `./.claude/skills/review-tool/SKILL.md` exists only as an actual skill materialization
- **AND** settings do not declare `team-pack` or `review-tool`
- **AND** a consumer queries `ctx.scope("project").skills.installed`
- **THEN** the projection SHALL NOT include an installed row for `review-tool`

#### Scenario: Pack-provided subagent is implicit installed inventory

- **WHEN** settings declare pack `team-pack`
- **AND** the installed pack dependency graph resolves `team-pack` with member subagent `code-reviewer`
- **AND** settings do not directly declare subagent `code-reviewer`
- **AND** a consumer queries `ctx.scope("project").subagents.installed`
- **THEN** the projection SHALL include an installed row for `code-reviewer`
- **AND** that row SHALL have installation origin `pack-member`

#### Scenario: Direct subagent declaration wins over pack membership

- **WHEN** settings declare pack `team-pack`
- **AND** settings directly declare subagent `code-reviewer` with `enabled: false`
- **AND** the installed pack dependency graph resolves `team-pack` with member subagent `code-reviewer`
- **AND** a consumer queries `ctx.scope("project").subagents.installed`
- **THEN** the projection SHALL include an installed row for `code-reviewer`
- **AND** that row SHALL have installation origin `direct`
- **AND** that row SHALL have activation `disabled`
- **AND** `ctx.scope("project").subagents.active` SHALL NOT include `code-reviewer`

#### Scenario: Disabled direct skill still claims actual materialization

- **WHEN** settings directly declare skill `review-tool` with `enabled: false`
- **AND** `./.claude/skills/review-tool/SKILL.md` exists
- **AND** a consumer queries `ctx.scope("project").skills.installed`
- **THEN** the projection SHALL include an installed row for `review-tool`
- **AND** that row SHALL have activation `disabled`
- **AND** `ctx.scope("project").skills.active` SHALL NOT include `review-tool`
- **AND** `ctx.scope("project").skills.unmanaged` SHALL NOT include `review-tool`

#### Scenario: Ignored skill is suppressed but raw evidence remains visible

- **WHEN** settings declare skill `review-tool`
- **AND** settings ignore skill `review-tool`
- **AND** `./.claude/skills/review-tool/SKILL.md` exists
- **AND** a consumer queries `ctx.scope("project").skills.declared`
- **THEN** the declared cell SHALL include `review-tool`
- **AND** `ctx.scope("project").skills.actual` SHALL include the actual occurrence for `review-tool`
- **AND** `ctx.scope("project").skills.installed` SHALL NOT include `review-tool`
- **AND** `ctx.scope("project").skills.unmanaged` SHALL NOT include `review-tool`
- **AND** `ctx.scope("project").skills.ignored` SHALL include the suppressed declared and actual candidates with ignored reasons

#### Scenario: Subject lockfile entry alone does not create implicit inventory

- **WHEN** `axm-lock.yaml` contains skill `review-tool`
- **AND** no installed pack dependency graph includes skill `review-tool`
- **AND** settings do not directly declare skill `review-tool`
- **AND** a consumer queries `ctx.scope("project").skills.installed`
- **THEN** the projection SHALL NOT include an installed row for `review-tool`
- **AND** `ctx.scope("project").diagnostics` SHALL include degraded resolved-state detail for `review-tool`

#### Scenario: Packs are not installed as pack members

- **WHEN** settings declare pack `platform-pack`
- **AND** `axm-lock.yaml` includes a member-like reference from `platform-pack` to pack `nested-pack`
- **AND** settings do not directly declare pack `nested-pack`
- **AND** a consumer queries `ctx.scope("project").packs.installed`
- **THEN** the projection SHALL NOT include an installed row for `nested-pack` due to pack membership

#### Scenario: Installed skills survive invalid lockfile

- **WHEN** `axm-lock.yaml` is corrupt
- **AND** actual skill materializations exist
- **AND** a consumer queries `ctx.scope("project").skills.installed`
- **THEN** the projection SHALL return installed skill rows it can derive from readable declared state and actual materialization facts
- **AND** `ctx.scope("project").diagnostics` SHALL include a lockfile warning

#### Scenario: Raw lockfile cell still exposes invalid lockfile

- **WHEN** `axm-lock.yaml` is corrupt
- **AND** a consumer queries `ctx.scope("project").state.lockfile`
- **THEN** the source cell SHALL fail with `LockfileReadError`

### Requirement: WorkspaceContext performs no source resolution or network I/O

The context SHALL expose declared source strings as written and SHALL NOT perform registry lookups, source-host resolution, remote fetches, or source metadata refreshes.

#### Scenario: Declared source remains unresolved

- **WHEN** settings declare skill `some-skill` with source `github:owner/repo`
- **AND** a consumer queries `ctx.scope("project").skills.declared`
- **THEN** the declared skill entry SHALL contain source `github:owner/repo`
- **AND** the context SHALL NOT contact GitHub or the AXM registry
