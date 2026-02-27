# cli-telemetry Specification

## Purpose

Anonymous telemetry and error reporting for the axm CLI. Provides visibility into usage patterns and field errors while respecting user privacy and consent.

## ADDED Requirements

### Requirement: Telemetry Setting

The system SHALL support a `telemetry` setting with three states controlling what data is sent.

#### Scenario: Telemetry enabled (default)

- **WHEN** the `telemetry` setting is `true` or absent
- **THEN** the system SHALL send both usage events and error reports to the telemetry API

#### Scenario: Telemetry disabled

- **WHEN** the `telemetry` setting is `false`
- **THEN** the system SHALL NOT send any data to the telemetry API

#### Scenario: Errors only

- **WHEN** the `telemetry` setting is `"errors"`
- **THEN** the system SHALL send error reports but SHALL NOT send usage events

#### Scenario: Setting stored in settings.json

- **WHEN** the user sets `"telemetry": false` or `"telemetry": "errors"` in `.axm/settings.json`
- **THEN** the system SHALL respect that value for all commands run in that workspace

#### Scenario: Project-scope takes precedence over user-scope

- **WHEN** project-scope settings (`.axm/settings.json`) and user-scope settings (`~/.axm/settings.json`) both define a `telemetry` value
- **THEN** the project-scope value SHALL take precedence

### Requirement: Environment Variable Overrides

Environment variables SHALL override the settings file, following a precedence chain.

#### Scenario: DO_NOT_TRACK disables all telemetry

- **WHEN** the `DO_NOT_TRACK` environment variable is set to `1`
- **THEN** the system SHALL disable all telemetry regardless of other settings
- **AND** SHALL NOT send any events or error reports

#### Scenario: AXM_TELEMETRY=0 disables all telemetry

- **WHEN** the `AXM_TELEMETRY` environment variable is set to `0` or `false`
- **THEN** the system SHALL disable all telemetry regardless of the settings file

#### Scenario: AXM_TELEMETRY=errors enables errors only

- **WHEN** the `AXM_TELEMETRY` environment variable is set to `errors`
- **THEN** the system SHALL send error reports only, regardless of the settings file

#### Scenario: AXM_TELEMETRY=1 enables all telemetry

- **WHEN** the `AXM_TELEMETRY` environment variable is set to `1` or `true`
- **THEN** the system SHALL send both usage events and error reports, regardless of the settings file

#### Scenario: Precedence chain

- **WHEN** multiple telemetry controls are set
- **THEN** the system SHALL resolve them in this order (first match wins):
  1. `DO_NOT_TRACK=1` → off
  2. `AXM_TELEMETRY` env var → mapped value
  3. Project-scope `settings.telemetry` → stored value
  4. User-scope `settings.telemetry` → stored value
  5. Default → all (enabled)

### Requirement: Usage Event Tracking

The system SHALL track CLI command invocations as usage events.

#### Scenario: Command event sent on invocation

- **WHEN** a CLI command is invoked and telemetry mode is `"all"`
- **THEN** the system SHALL send a `POST /events` request to the telemetry API

#### Scenario: No usage events in errors-only mode

- **WHEN** a CLI command is invoked and telemetry mode is `"errors"`
- **THEN** the system SHALL NOT send a usage event

#### Scenario: Event payload format

- **WHEN** a usage event is sent
- **THEN** the payload SHALL conform to the `POST /events` schema in `api-1.json`
- **AND** SHALL include `event` name, `distinctId` (hashed hostname), and `timestamp` (ISO-8601)
- **AND** SHALL include `context` with `client` (name: `cli`, version), `os` (name, version), `runtime` (name: `bun`, version), `device` (arch), and `ci` flag

#### Scenario: Event properties

- **WHEN** a usage event is sent
- **THEN** the `properties` object SHALL include the `command` name (e.g., `"skills install"`)
- **AND** SHALL NOT include file paths, file contents, environment variables, or any PII

### Requirement: Error Reporting

The system SHALL report unhandled errors and defects to the telemetry API.

#### Scenario: CliError reported

- **WHEN** a `CliError` reaches the runtime boundary and telemetry mode is `"all"` or `"errors"`
- **THEN** the system SHALL send a `POST /errors` request with the error details

#### Scenario: Defect reported

- **WHEN** an unhandled defect reaches the runtime boundary and telemetry mode is `"all"` or `"errors"`
- **THEN** the system SHALL send a `POST /errors` request with the defect information

#### Scenario: No error reports when disabled

- **WHEN** telemetry mode is `"off"`
- **THEN** the system SHALL NOT send any error reports

#### Scenario: CliError payload contents

- **WHEN** a `CliError` is reported
- **THEN** the error object SHALL include `name` (the error code, e.g., `"SETTINGS_PARSE_FAILED"`), `message` (the `what` field), and the `level` SHALL be `"error"`
- **AND** `handled` SHALL be `true`
- **AND** `tags` SHALL include the `errorCode`
- **AND** `fingerprint` SHALL include the error code for grouping
- **AND** the `context` SHALL include the `command` that triggered the error
- **AND** the `details` and `howToFix` fields from `CliError` MAY be included

#### Scenario: Defect payload contents

- **WHEN** a defect is reported
- **THEN** the error object SHALL include `name` as `"Defect"` and `message` from the defect
- **AND** `handled` SHALL be `false`
- **AND** `level` SHALL be `"fatal"`
- **AND** stack traces SHALL NOT be included (they may contain absolute file paths)

#### Scenario: Cause field excluded

- **WHEN** any error is reported
- **THEN** the `cause` field from `CliError` SHALL NOT be sent as it may contain uncontrolled data from third-party libraries

### Requirement: Fire-and-Forget Delivery

Telemetry SHALL never block CLI execution or cause user-visible failures. Delivery is best-effort.

#### Scenario: Telemetry API unreachable

- **WHEN** the telemetry API is unreachable or returns an error
- **THEN** the system SHALL silently discard the event
- **AND** SHALL NOT display any error to the user
- **AND** SHALL NOT affect the command's exit code

#### Scenario: Telemetry does not block command execution

- **WHEN** a command completes and telemetry is being sent
- **THEN** the CLI SHALL NOT wait for the telemetry request to finish before exiting

#### Scenario: Fast command telemetry loss

- **WHEN** a command completes in less time than the telemetry HTTP request needs to send
- **THEN** the telemetry event MAY be lost
- **AND** this is acceptable behavior for best-effort analytics

### Requirement: Anonymous Machine Identifier

The system SHALL generate a stable anonymous identifier for aggregate analytics.

#### Scenario: Machine ID is a hashed hostname

- **WHEN** generating the anonymous machine ID
- **THEN** the system SHALL compute a SHA-256 hash of `os.hostname()`
- **AND** SHALL use this hash as the `distinctId` in event payloads and `user.id` in error payloads

#### Scenario: Machine ID is not reversible

- **WHEN** the machine ID is included in telemetry
- **THEN** it SHALL NOT be possible to recover the original hostname from the hash

### Requirement: Test Environment Isolation

Telemetry SHALL be automatically disabled in test environments.

#### Scenario: Unit tests use no-op layer

- **WHEN** running unit tests that provide Effect layers
- **THEN** a `TelemetryClientTest` no-op layer SHALL be available that silently discards all events

#### Scenario: E2E tests disable telemetry via environment

- **WHEN** running E2E tests via the `runCli` helper
- **THEN** the helper SHALL set `AXM_TELEMETRY=0` in the subprocess environment by default

#### Scenario: VITEST environment auto-disables

- **WHEN** the `VITEST` environment variable is set to `true`
- **THEN** the telemetry layer SHALL use the no-op implementation automatically

### Requirement: TelemetryClient Effect Service

The system SHALL provide a `TelemetryClient` Effect service for all telemetry operations.

#### Scenario: Service available in AppLayer

- **WHEN** a command handler needs to track events
- **THEN** it SHALL yield the `TelemetryClient` service from the Effect context

#### Scenario: Two methods

- **WHEN** using the `TelemetryClient` service
- **THEN** it SHALL provide `trackEvent` for usage events and `reportError` for error reports

#### Scenario: Telemetry API base URL

- **WHEN** the `TelemetryClient` sends data
- **THEN** it SHALL send to `https://t.agentxm.ai` using the existing `HttpClient` service
- **AND** SHALL use `POST /events` for usage events and `POST /errors` for error reports

#### Scenario: Telemetry active without workspace

- **WHEN** a command runs without a workspace (e.g., before `axm init`)
- **THEN** the `TelemetryClient` SHALL still be active using env vars and default settings
- **AND** SHALL NOT require a workspace to resolve telemetry mode

### Requirement: Command Name in RunOptions

The `run()` function SHALL accept a command name for telemetry context.

#### Scenario: Command name passed via RunOptions

- **WHEN** a yargs command calls `run(program, options)`
- **THEN** `options` SHALL accept an optional `command` string (e.g., `"skills install"`)
- **AND** the command name SHALL be available to both `trackEvent` and `reportError`

#### Scenario: Error report includes command name

- **WHEN** an error is reported from `run()`'s error handler
- **THEN** the error payload's `context.command` field SHALL use the command name from `RunOptions`

#### Scenario: Command name omitted

- **WHEN** `run()` is called without a `command` in options
- **THEN** the `context.command` field SHALL default to `"unknown"`
