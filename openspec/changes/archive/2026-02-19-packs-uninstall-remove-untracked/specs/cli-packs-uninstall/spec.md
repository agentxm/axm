## ADDED Requirements

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
