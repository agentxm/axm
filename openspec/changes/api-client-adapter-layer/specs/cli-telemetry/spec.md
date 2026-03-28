## MODIFIED Requirements

### Requirement: Usage Event Tracking

The system SHALL track CLI command invocations as usage events. HTTP transport SHALL use the generated telemetry client.

#### Scenario: Command event sent on invocation

- **WHEN** a CLI command is invoked and telemetry mode is `"all"`
- **THEN** the system SHALL send a `POST /v1/events` request to the telemetry API via the generated `EventsIngest` operation

#### Scenario: No usage events in errors-only mode

- **WHEN** a CLI command is invoked and telemetry mode is `"errors"`
- **THEN** the system SHALL NOT send a usage event

#### Scenario: Event payload format

- **WHEN** a usage event is sent
- **THEN** the payload SHALL conform to the generated `EventsIngest` request schema
- **AND** SHALL include `event` name, `distinctId` (hashed hostname), and `timestamp` (ISO-8601)
- **AND** SHALL include `context` with `client` (name: `cli`, version), `os` (name, version), `runtime` (name: `bun`, version), `device` (arch), and `ci` flag

#### Scenario: Event properties

- **WHEN** a usage event is sent
- **THEN** the `properties` object SHALL include the `command` name (e.g., `"skills install"`)
- **AND** SHALL NOT include file paths, file contents, environment variables, or any PII

### Requirement: Error Reporting

The system SHALL report unhandled errors and defects to the telemetry API. HTTP transport SHALL use the generated telemetry client.

#### Scenario: AppError reported

- **WHEN** a `AppError` reaches the runtime boundary and telemetry mode is `"all"` or `"errors"`
- **THEN** the system SHALL send a `POST /v1/errors` request via the generated `ErrorsIngest` operation

#### Scenario: Defect reported

- **WHEN** an unhandled defect reaches the runtime boundary and telemetry mode is `"all"` or `"errors"`
- **THEN** the system SHALL send a `POST /v1/errors` request via the generated `ErrorsIngest` operation

#### Scenario: No error reports when disabled

- **WHEN** telemetry mode is `"off"`
- **THEN** the system SHALL NOT send any error reports

#### Scenario: AppError payload contents

- **WHEN** a `AppError` is reported
- **THEN** the error object SHALL include `name` (the error code, e.g., `"SETTINGS_PARSE_FAILED"`), `message` (the `what` field), and the `level` SHALL be `"error"`
- **AND** `handled` SHALL be `true`
- **AND** `tags` SHALL include the `errorCode`
- **AND** `fingerprint` SHALL include the error code for grouping
- **AND** the `context` SHALL include the `command` that triggered the error
- **AND** the `details` and `howToFix` fields from `AppError` MAY be included

#### Scenario: Defect payload contents

- **WHEN** a defect is reported
- **THEN** the error object SHALL include `name` as `"Defect"` and `message` from the defect
- **AND** `handled` SHALL be `false`
- **AND** `level` SHALL be `"fatal"`
- **AND** stack traces SHALL NOT be included (they may contain absolute file paths)

#### Scenario: Cause field excluded

- **WHEN** any error is reported
- **THEN** the `cause` field from `AppError` SHALL NOT be sent as it may contain uncontrolled data from third-party libraries

### Requirement: Fire-and-Forget Delivery

Telemetry SHALL never block CLI execution or cause user-visible failures. Delivery is best-effort. `makeTelemetryClient` SHALL wrap generated client calls with `swallowFailure` and `forkDetach`.

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

### Requirement: Metadata enrichment stays in makeTelemetryClient

The `makeTelemetryClient` function SHALL remain responsible for constructing the rich context object included in every telemetry payload. The generated client SHALL only handle HTTP transport.

#### Scenario: Metadata built before generated client call

- **WHEN** a telemetry event or error report is sent
- **THEN** `makeTelemetryClient` SHALL build the context (OS, runtime, CI, distinctId, client info)
- **AND** SHALL pass the fully-enriched payload to the generated client
- **AND** the generated client SHALL NOT add or modify metadata

#### Scenario: Mode gating applied before generated client call

- **WHEN** the telemetry mode is `"off"` or `"errors"`
- **THEN** `makeTelemetryClient` SHALL short-circuit before calling the generated client
- **AND** the generated client SHALL NOT be invoked for suppressed operations
