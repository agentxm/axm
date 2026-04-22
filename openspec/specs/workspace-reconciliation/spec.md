## MODIFIED Requirements

### Requirement: Reconciliation engine supports subagent render-on-install

`axm sync` SHALL reconcile subagents across all configured agents using render-on-install. Unlike skills (symlinks), subagent reconciliation involves rendering agent-native files from the canonical SUBAGENT.md.

#### Scenario: Full reconciliation flow

- **WHEN** `axm sync` is run
- **AND** `code-reviewer` is in settings with `enabled: true`
- **THEN** the sync engine SHALL read `.axm/extensions/.../SUBAGENT.md`
- **AND** SHALL render agent-native files for each configured agent
- **AND** SHALL update the entry-level `sourceHash` and `renderedFiles` paths in the lockfile

#### Scenario: Skip re-render when source unchanged

- **WHEN** `axm sync` computes the source hash of SUBAGENT.md
- **AND** the hash matches the lockfile's entry-level `sourceHash`
- **THEN** the sync engine SHOULD skip re-rendering for that subagent (optimization)

### Requirement: Frontmatter-to-manifest sync during reconciliation

`axm sync` SHALL sync `description`, `model`, `toolAccess`, and `background` from SUBAGENT.md frontmatter to the manifest for each managed subagent.

#### Scenario: Manifest updated from frontmatter

- **WHEN** `axm sync` runs
- **AND** SUBAGENT.md frontmatter has `model: "fast"` but manifest has `model: "default"`
- **THEN** sync SHALL update the manifest to `model: "fast"`

### Requirement: Re-rendering on source change

`axm sync` SHALL re-render subagent files when the source has changed (source hash mismatch). Rendered files with the managed marker are always overwritten — there is no per-file drift detection via content hashing. Manually edited rendered files are overwritten when the source changes; to stop AXM from managing a file, uninstall or disable the extension.

#### Scenario: Source changed, rendered file re-rendered

- **WHEN** `axm sync` runs
- **AND** the SUBAGENT.md source hash differs from the lockfile's `sourceHash`
- **THEN** sync SHALL re-render agent-native files for all configured agents
- **AND** SHALL overwrite rendered files that contain the managed marker

#### Scenario: Source unchanged, rendering skipped

- **WHEN** `axm sync` runs
- **AND** the SUBAGENT.md source hash matches the lockfile's `sourceHash`
- **THEN** sync SHALL skip re-rendering for that subagent (optimization)

### Requirement: Agent list change reconciliation

When the `agents` list in `settings.json` changes, `axm sync` SHALL automatically adjust rendered files.

#### Scenario: Agent added

- **WHEN** `gemini-cli` is added to the agents list
- **AND** `axm sync` is run
- **THEN** sync SHALL render all installed subagents for Gemini CLI (respecting each subagent's `agents` filter)

#### Scenario: Agent removed

- **WHEN** `cursor` is removed from the agents list
- **AND** `axm sync` is run
- **THEN** sync SHALL delete rendered files for Cursor (using lockfile `renderedFiles` paths)
- **AND** SHALL remove Cursor entries from the lockfile `renderedFiles` map

### Requirement: Disabled subagents have no rendered files

Disabled subagents SHALL NOT have rendered files after reconciliation. If a subagent's `enabled` field changes to `false`, sync SHALL remove its rendered files.

#### Scenario: Disabled subagent files removed on sync

- **WHEN** `code-reviewer` has `enabled: false` in settings
- **AND** rendered files still exist from before it was disabled
- **AND** `axm sync` is run
- **THEN** sync SHALL remove all rendered files for `code-reviewer`

#### Scenario: Enabled subagent files created on sync

- **WHEN** `code-reviewer` has `enabled: true` in settings
- **AND** no rendered files exist (e.g., after enable)
- **AND** `axm sync` is run
- **THEN** sync SHALL render files for all configured agents

### Requirement: Orphan subagent cleanup

When a subagent is present in the lockfile but absent from settings (and not transitively provided by a pack), sync SHALL remove its rendered files and lockfile entry.

#### Scenario: Orphaned subagent cleaned up

- **WHEN** `code-reviewer` is in the lockfile with rendered files
- **AND** `code-reviewer` has no entry in settings and is not provided by any pack
- **AND** `axm sync` is run
- **THEN** sync SHALL remove all rendered files for `code-reviewer`
- **AND** SHALL remove the lockfile entry

### Requirement: Managed marker verification

During reconciliation, the sync engine SHALL verify that files at render paths contain the AXM managed marker before overwriting. Files without the marker SHALL be treated as conflicts.

#### Scenario: Unmanaged file at render path is a conflict

- **WHEN** `axm sync` encounters `.claude/agents/code-reviewer.md` without the managed header
- **AND** `code-reviewer` is a managed subagent
- **THEN** sync SHALL report a conflict and skip rendering for that agent
- **AND** SHALL warn the user to resolve the conflict manually or use `--force`

### Requirement: Classifier carries artifact locations through classification

The workspace classifier SHALL accept detected entries with locations (not just names) and SHALL attach locations to `lifecycle: "unmanaged"` classified extensions. Locations SHALL be relative to the workspace root.

#### Scenario: Unmanaged extension includes locations

- **WHEN** `detectSkillNamesOnDisk` discovers skill `legacy-tool` at `.claude/skills/legacy-tool`
- **AND** `legacy-tool` is classified as `lifecycle: "unmanaged"`
- **THEN** the classified extension entry SHALL include `locations: [".claude/skills/legacy-tool"]`

#### Scenario: Unmanaged extension in multiple agent directories

- **WHEN** `detectSkillNamesOnDisk` discovers skill `old-skill` at both `.claude/skills/old-skill` and `.agents/skills/old-skill`
- **AND** `old-skill` is classified as `lifecycle: "unmanaged"`
- **THEN** the classified extension entry SHALL include `locations: [".claude/skills/old-skill", ".agents/skills/old-skill"]`

#### Scenario: Configured extension does not need locations

- **WHEN** skill `my-skill` is classified as `lifecycle: "configured"`
- **THEN** the classified extension entry does not need to carry locations (configured extensions have known paths via settings)

### Requirement: Lint stale detection uses the workspace classifier

The `skills-artifacts-clean` lint rule SHALL use the workspace classifier to identify stale (unmanaged) skills instead of inline per-agent detection logic. An artifact is stale if and only if the classifier classifies it as `lifecycle: "unmanaged"`.

#### Scenario: Stale artifact detected via classifier

- **WHEN** skill `orphaned-tool` exists in `.claude/skills/orphaned-tool`
- **AND** the classifier classifies `orphaned-tool` as `lifecycle: "unmanaged"`
- **THEN** the lint rule SHALL report a stale finding for `orphaned-tool`

#### Scenario: Universal directory artifact detected as stale

- **WHEN** skill `old-shared` exists in `.agents/skills/old-shared`
- **AND** no agent declares `old-shared` as configured or enabled
- **AND** the classifier classifies `old-shared` as `lifecycle: "unmanaged"`
- **THEN** the lint rule SHALL report a stale finding for `old-shared`

#### Scenario: Universal directory artifact not stale when claimed

- **WHEN** skill `active-shared` exists in `.agents/skills/active-shared`
- **AND** at least one agent declares `active-shared` in settings
- **AND** the classifier classifies `active-shared` as `lifecycle: "configured"`
- **THEN** the lint rule SHALL NOT report a stale finding for `active-shared`

### Requirement: Lint stale findings suggest axm prune

Lint advisory messages for stale skill artifacts SHALL suggest `axm prune` or `axm skills prune <name>` as the remediation action.

#### Scenario: Advisory message references prune command

- **WHEN** the lint rule reports a stale finding for skill `legacy-tool`
- **THEN** the advisory message SHALL include a suggestion to run `axm prune` or `axm skills prune legacy-tool`
