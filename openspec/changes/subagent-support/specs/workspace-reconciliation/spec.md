## MODIFIED Requirements

### Requirement: Reconciliation engine supports subagent render-on-install

`axm sync` SHALL reconcile subagents across all configured agents using render-on-install. Unlike skills (symlinks), subagent reconciliation involves rendering agent-native files from the canonical SUBAGENT.md.

#### Scenario: Full reconciliation flow

- **WHEN** `axm sync` is run
- **AND** `code-reviewer` is in settings with `enabled: true`
- **THEN** the sync engine SHALL read `.axm/extensions/.../SUBAGENT.md`
- **AND** SHALL render agent-native files for each configured agent
- **AND** SHALL compute content hashes and update `renderedFiles` in the lockfile

#### Scenario: Skip write when content unchanged

- **WHEN** `axm sync` renders a subagent
- **AND** the rendered content hash matches the lockfile hash
- **THEN** the sync engine SHOULD skip the file write (optimization)

### Requirement: Frontmatter-to-manifest sync during reconciliation

`axm sync` SHALL sync `description`, `model`, `toolAccess`, and `background` from SUBAGENT.md frontmatter to the manifest for each managed subagent.

#### Scenario: Manifest updated from frontmatter

- **WHEN** `axm sync` runs
- **AND** SUBAGENT.md frontmatter has `model: "fast"` but manifest has `model: "default"`
- **THEN** sync SHALL update the manifest to `model: "fast"`

### Requirement: Drift detection and re-rendering

`axm sync` SHALL detect drift by comparing rendered file content hashes against lockfile values. Drifted files SHALL be re-rendered with a warning.

#### Scenario: Drifted file re-rendered

- **WHEN** `axm sync` runs
- **AND** `.claude/agents/code-reviewer.md` has been manually modified (hash differs from lockfile)
- **THEN** sync SHALL re-render the file from the canonical source
- **AND** SHALL warn: `Re-rendered .claude/agents/code-reviewer.md (local modifications overwritten)`

#### Scenario: Non-drifted files preserved

- **WHEN** `axm sync` runs
- **AND** all rendered files match their lockfile hashes
- **THEN** sync SHALL either skip writes or write identical content

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
