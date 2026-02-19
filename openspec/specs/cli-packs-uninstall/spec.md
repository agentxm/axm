## ADDED Requirements

### Requirement: Uninstall pack and orphaned extensions

`axm packs uninstall <name>` SHALL remove the pack and any orphaned extensions it brought in.

The name SHALL support glob patterns to match multiple packs.

#### Scenario: Uninstall pack with orphaned extensions

- **WHEN** user runs `axm packs uninstall @acme/frontend-pack`
- **AND** the pack's `resolvedSkills` contains `@acme/code-review`
- **AND** `@acme/code-review` has no direct settings entry and no other pack references it
- **THEN** the plan includes `uninstall-pack` for the pack AND `uninstall-skill` for `@acme/code-review`

#### Scenario: Uninstall pack with shared extensions

- **WHEN** user runs `axm packs uninstall @acme/pack-a`
- **AND** `@acme/code-review` is referenced by both `pack-a` and `pack-b`
- **AND** `pack-b` is still installed
- **THEN** the plan includes `uninstall-pack` for `pack-a`
- **AND** `@acme/code-review` is NOT included in the uninstall plan

#### Scenario: Uninstall pack with promoted extension

- **WHEN** user runs `axm packs uninstall @acme/frontend-pack`
- **AND** `@acme/code-review` was promoted to a direct settings entry (e.g., via disable)
- **THEN** `@acme/code-review` is NOT orphaned and remains installed

#### Scenario: Glob pattern matches multiple packs

- **WHEN** user runs `axm packs uninstall "@acme/*"`
- **AND** packs `@acme/pack-a` and `@acme/pack-b` are installed
- **THEN** both packs are included in the uninstall plan
- **AND** orphan detection considers all packs being removed together

### Requirement: Uninstall plan display and confirmation

The uninstall plan SHALL be displayed before execution, showing the pack and all orphaned extensions to be removed.

#### Scenario: Preview mode

- **WHEN** user runs `axm packs uninstall @acme/frontend-pack --preview`
- **THEN** the plan is displayed but NOT applied

#### Scenario: Auto-accept

- **WHEN** user runs `axm packs uninstall @acme/frontend-pack --yes`
- **THEN** the plan is applied without prompting

### Requirement: Uninstall removes settings and lockfile entries

After successful uninstall, the pack entry SHALL be removed from both settings.json and the lockfile `packs` section. Orphaned extension entries SHALL also be removed from their respective settings and lockfile sections.

#### Scenario: Clean removal from settings and lockfile

- **WHEN** pack `@acme/frontend-pack` is successfully uninstalled
- **THEN** the `packs` section in settings.json no longer contains `frontend-pack`
- **AND** the `packs` section in the lockfile no longer contains `@acme/frontend-pack`

### Requirement: Uninstall removes orphaned pack folder from disk

`axm packs uninstall <name>` SHALL remove the pack's managed extension folder from disk even when the pack is not present in the lockfile or settings.

When the pack is not in the lockfile, the command SHALL scan `.axm/extensions/@*/packs/<name>/` for a matching directory and remove it if found.

#### Scenario: Pack folder exists on disk but not in lockfile

- **WHEN** user runs `axm packs uninstall testing`
- **AND** `testing` is not in the lockfile or settings
- **AND** `.axm/extensions/@test/packs/testing/` exists on disk
- **THEN** the directory `.axm/extensions/@test/packs/testing/` SHALL be removed
- **AND** the result SHALL be `success` (not `no-op`)

#### Scenario: Pack folder does not exist on disk or in lockfile

- **WHEN** user runs `axm packs uninstall testing`
- **AND** `testing` is not in the lockfile or settings
- **AND** no matching directory exists under `.axm/extensions/@*/packs/testing/`
- **THEN** the result SHALL be `no-op` with message "not installed"

#### Scenario: Pack folder exists under multiple namespaces

- **WHEN** user runs `axm packs uninstall testing`
- **AND** `testing` is not in the lockfile
- **AND** `.axm/extensions/@foo/packs/testing/` and `.axm/extensions/@bar/packs/testing/` both exist
- **THEN** both directories SHALL be removed
