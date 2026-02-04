## REMOVED Requirements

### Requirement: JSON Output Flag

**Reason**: Feature was incomplete—only dry-run plan output was implemented. Removing to simplify codebase.

**Migration**: Use text output. For scripting, parse exit codes and stderr/stdout text.

#### Scenario: JSON flag removed

- **WHEN** user passes `--json` flag to `axm skills uninstall`
- **THEN** the CLI SHALL reject the flag as unrecognized

### Requirement: JSON Plan Output

**Reason**: Only used with `--json` flag which is being removed.

**Migration**: None required. Dry-run still works with human-readable output.

#### Scenario: Dry-run outputs text

- **WHEN** user runs `axm skills uninstall --dry-run`
- **THEN** the CLI SHALL output human-readable plan summary
- **AND** the CLI SHALL NOT output JSON-formatted plan
