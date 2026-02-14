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
