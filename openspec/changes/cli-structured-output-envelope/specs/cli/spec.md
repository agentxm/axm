## MODIFIED Requirements

### Requirement: Output modes

The CLI SHALL keep machine-readable results separate from human-oriented status
output. JSON-capable commands SHALL write one final stdout object and SHALL send
progress, logs, suggestions, and error events to stderr in machine mode.

#### Scenario: JSON output stays machine-readable

- **WHEN** the user runs a command with `--json`
- **THEN** machine-readable result data SHALL be written to stdout
- **AND** progress, notes, suggestions, and other status output SHALL NOT pollute stdout

#### Scenario: Success JSON uses a flat envelope

- **WHEN** a JSON-capable command succeeds with payload `{ "items": [] }`
- **THEN** stdout SHALL contain `{ "ok": true, "items": [] }`
- **AND** stdout SHALL NOT contain a top-level `command` discriminator
- **AND** stdout SHALL NOT wrap the payload in `data` unless `data` is the
  command's primary payload key

#### Scenario: Error JSON uses the standard error envelope

- **WHEN** a JSON-capable command fails
- **THEN** stdout SHALL contain `ok: false`, `code`, and `message`
- **AND** stdout MAY contain `howToFix` and `suggestions`
- **AND** stdout SHALL NOT contain `details`
- **AND** stdout SHALL NOT restate the process exit status as `exitCode`
- **AND** stderr SHALL include an `error` NDJSON event for the same failure

#### Scenario: Machine stderr events are unversioned

- **WHEN** a command emits machine-mode stderr diagnostics
- **THEN** each event SHALL include a `type`
- **AND** events SHALL NOT include `_version`

#### Scenario: SuggestedAction command forms

- **WHEN** a command emits a suggestion
- **THEN** the suggestion SHALL include either `command` as an argv array or `cmd`
  as a display string
- **AND** a suggestion without either command form SHALL be rejected

#### Scenario: Human-readable lists and details remain readable by default

- **WHEN** the user runs a list or detail command without `--json`
- **THEN** the CLI SHALL render human-readable output suitable for terminal use
