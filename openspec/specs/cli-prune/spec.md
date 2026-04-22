### Requirement: Prune removes unmanaged skill artifacts

`axm prune` and `axm skills prune` SHALL remove on-disk artifacts for skills classified as `lifecycle: "unmanaged"` by the workspace classifier. Artifacts classified as configured, implicit, or ignored SHALL NOT be removed.

#### Scenario: Unmanaged skill artifact pruned

- **WHEN** skill `legacy-tool` exists in `.claude/skills/legacy-tool/`
- **AND** `legacy-tool` is not in `settings.skills`, not in the lockfile, and not matched by `settings.ignored.skills`
- **THEN** `axm skills prune` SHALL remove `.claude/skills/legacy-tool/`

#### Scenario: Configured skill not pruned

- **WHEN** skill `my-skill` exists in `.claude/skills/my-skill/`
- **AND** `my-skill` is declared in `settings.skills`
- **THEN** `axm skills prune` SHALL NOT remove `.claude/skills/my-skill/`

#### Scenario: Ignored skill not pruned

- **WHEN** skill `internal-tool` exists in `.claude/skills/internal-tool/`
- **AND** `settings.ignored.skills` contains a pattern matching `internal-tool`
- **THEN** `axm skills prune` SHALL NOT remove `.claude/skills/internal-tool/`

#### Scenario: Implicit (pack-retained) skill not pruned

- **WHEN** skill `pack-skill` exists in `.claude/skills/pack-skill/`
- **AND** `pack-skill` is in the lockfile as a native entry provided by a pack
- **THEN** `axm skills prune` SHALL NOT remove `.claude/skills/pack-skill/`

### Requirement: Prune supports glob pattern filtering

`axm prune [patterns...]` and `axm skills prune [patterns...]` SHALL accept optional glob patterns to filter which unmanaged skills are candidates for pruning. Patterns SHALL match against extension names using the same `expandGlob` semantics as `settings.ignored`.

#### Scenario: Pattern filters prunable skills

- **WHEN** unmanaged skills `effect-basics`, `effect-layers`, and `legacy-tool` exist
- **AND** user runs `axm skills prune effect-*`
- **THEN** only `effect-basics` and `effect-layers` SHALL be candidates for removal
- **AND** `legacy-tool` SHALL NOT be a candidate

#### Scenario: Multiple patterns combined

- **WHEN** unmanaged skills `effect-basics`, `legacy-tool`, and `old-helper` exist
- **AND** user runs `axm skills prune effect-* legacy-*`
- **THEN** `effect-basics` and `legacy-tool` SHALL be candidates for removal
- **AND** `old-helper` SHALL NOT be a candidate

#### Scenario: No patterns means all unmanaged

- **WHEN** unmanaged skills `effect-basics` and `legacy-tool` exist
- **AND** user runs `axm skills prune` with no patterns
- **THEN** both `effect-basics` and `legacy-tool` SHALL be candidates for removal

### Requirement: Prune requires confirmation by default

`axm prune` and `axm skills prune` SHALL preview the list of artifacts to be removed and prompt for confirmation before deleting. The `--yes` flag SHALL skip the confirmation prompt.

#### Scenario: User confirms deletion

- **WHEN** user runs `axm skills prune`
- **AND** 3 unmanaged skill artifacts are detected
- **THEN** the command SHALL display the list of artifacts with names and paths
- **AND** SHALL prompt "Remove 3 artifacts? (y/N)"
- **AND** SHALL only delete after the user confirms

#### Scenario: User declines deletion

- **WHEN** user runs `axm skills prune`
- **AND** user responds "N" to the confirmation prompt
- **THEN** no artifacts SHALL be removed
- **AND** the command SHALL exit with code 0

#### Scenario: --yes skips confirmation

- **WHEN** user runs `axm skills prune --yes`
- **AND** unmanaged skill artifacts are detected
- **THEN** the command SHALL remove artifacts without prompting

### Requirement: Prune handles nothing-to-prune gracefully

When no unmanaged artifacts match the criteria, the command SHALL report a clean state and exit successfully.

#### Scenario: No unmanaged artifacts

- **WHEN** user runs `axm skills prune`
- **AND** no unmanaged skill artifacts exist
- **THEN** the command SHALL print a message indicating nothing to prune
- **AND** SHALL exit with code 0

#### Scenario: Patterns match no unmanaged artifacts

- **WHEN** unmanaged skill `legacy-tool` exists
- **AND** user runs `axm skills prune effect-*`
- **AND** no unmanaged skills match `effect-*`
- **THEN** the command SHALL print a message indicating nothing to prune
- **AND** SHALL exit with code 0

### Requirement: Root prune aggregates across extension types

`axm prune` SHALL aggregate prunable artifacts across all extension types using per-type collectors (following the `axm install` aggregation pattern). In v1, only the skills collector SHALL produce results.

#### Scenario: Root prune includes skills

- **WHEN** user runs `axm prune`
- **AND** unmanaged skill artifacts exist
- **THEN** the command SHALL include skill artifacts in the prunable list

#### Scenario: Root prune with patterns filters across types

- **WHEN** user runs `axm prune effect-*`
- **THEN** patterns SHALL be applied to unmanaged extensions across all types

### Requirement: Prune supports JSON output

`axm prune` and `axm skills prune` SHALL support a `--json` flag for structured output.

#### Scenario: JSON-only is read-only inspection

- **WHEN** user runs `axm skills prune --json`
- **THEN** the command SHALL output the list of prunable artifacts as JSON
- **AND** SHALL NOT prompt for confirmation
- **AND** SHALL NOT delete any artifacts

#### Scenario: JSON with --yes prunes and reports

- **WHEN** user runs `axm skills prune --yes --json`
- **AND** unmanaged skill artifacts exist
- **THEN** the command SHALL remove the artifacts
- **AND** SHALL output structured JSON of what was removed

### Requirement: Prune exit codes

The prune command SHALL use consistent exit codes.

#### Scenario: Successful prune

- **WHEN** artifacts are pruned successfully
- **THEN** the command SHALL exit with code 0

#### Scenario: Nothing to prune

- **WHEN** no prunable artifacts are found
- **THEN** the command SHALL exit with code 0

#### Scenario: User declines

- **WHEN** user declines the confirmation prompt
- **THEN** the command SHALL exit with code 0

#### Scenario: Unexpected error

- **WHEN** an error occurs (filesystem failure, workspace not initialized)
- **THEN** the command SHALL exit with code 1

### Requirement: Prune uses classifier locations for deletion

Prune SHALL use artifact locations provided by the workspace classifier's enriched output (relative paths from workspace root). It SHALL NOT perform a second disk scan to locate artifacts.

#### Scenario: Classifier provides artifact paths

- **WHEN** the classifier identifies `legacy-tool` as unmanaged
- **AND** the classifier reports locations `[".claude/skills/legacy-tool", ".agents/skills/legacy-tool"]`
- **THEN** prune SHALL remove both directories
- **AND** SHALL NOT re-scan agent directories to find them

### Requirement: Prune does not modify settings or lockfile

Prune SHALL only remove on-disk artifact directories. It SHALL NOT modify `settings.json` or `axm-lock.yaml`.

#### Scenario: Settings and lockfile unchanged after prune

- **WHEN** user runs `axm skills prune --yes`
- **AND** artifacts are removed
- **THEN** `settings.json` SHALL be unchanged
- **AND** `axm-lock.yaml` SHALL be unchanged
