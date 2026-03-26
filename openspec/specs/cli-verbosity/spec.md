## ADDED Requirements

### Requirement: Verbosity service interface

The `Verbosity` service SHALL be a standalone Effect service exposing `level` (the resolved `VerbosityLevel`) and `isAtLeast(min)` (comparison against level ordering). It SHALL be independent of `CliRenderer`.

#### Scenario: Handler reads verbosity level

- **WHEN** a handler yields `Verbosity`
- **THEN** it SHALL receive a service with `level` as one of `"quiet"`, `"normal"`, `"verbose"`, or `"debug"`
- **AND** `isAtLeast(min)` SHALL return a boolean comparison

#### Scenario: isAtLeast follows level ordering

- **WHEN** the verbosity level is `"verbose"`
- **THEN** `isAtLeast("quiet")` SHALL return `true`
- **AND** `isAtLeast("normal")` SHALL return `true`
- **AND** `isAtLeast("verbose")` SHALL return `true`
- **AND** `isAtLeast("debug")` SHALL return `false`

### Requirement: Four verbosity levels with strict ordering

The `VerbosityLevel` type SHALL be `"quiet" | "normal" | "verbose" | "debug"` with ordering `quiet < normal < verbose < debug`.

#### Scenario: Quiet is the lowest level

- **WHEN** the verbosity level is `"quiet"`
- **THEN** `isAtLeast("quiet")` SHALL be `true`
- **AND** `isAtLeast("normal")` SHALL be `false`

#### Scenario: Debug is the highest level

- **WHEN** the verbosity level is `"debug"`
- **THEN** `isAtLeast("quiet")` SHALL be `true`
- **AND** `isAtLeast("debug")` SHALL be `true`

### Requirement: Flag resolution from argv

Verbosity SHALL be resolved from raw argv at the `run()` boundary using right-to-left scanning. The last verbosity flag wins.

#### Scenario: -q sets quiet level

- **WHEN** the user passes `-q` or `--quiet`
- **THEN** the verbosity level SHALL be `"quiet"`

#### Scenario: -v sets verbose level

- **WHEN** the user passes `-v` or `--verbose`
- **THEN** the verbosity level SHALL be `"verbose"`

#### Scenario: -vv sets debug level

- **WHEN** the user passes `-vv` or `--debug`
- **THEN** the verbosity level SHALL be `"debug"`

#### Scenario: No verbosity flag defaults to normal

- **WHEN** no verbosity flag is passed
- **THEN** the verbosity level SHALL be `"normal"`

#### Scenario: Last flag wins on conflict

- **WHEN** the user passes `-q -v`
- **THEN** the verbosity level SHALL be `"verbose"` (last flag wins)

- **WHEN** the user passes `-v -q`
- **THEN** the verbosity level SHALL be `"quiet"` (last flag wins)

### Requirement: Conditional emission helpers

Pure functions `whenNotQuiet`, `whenVerbose`, and `whenDebug` SHALL wrap an Effect and only execute it when the verbosity level meets the threshold. They SHALL yield the `Verbosity` service internally.

#### Scenario: whenNotQuiet executes at normal level

- **WHEN** the verbosity level is `"normal"`
- **AND** a handler calls `whenNotQuiet(renderer.info("count"))`
- **THEN** the wrapped effect SHALL execute

#### Scenario: whenNotQuiet skips at quiet level

- **WHEN** the verbosity level is `"quiet"`
- **AND** a handler calls `whenNotQuiet(renderer.info("count"))`
- **THEN** the wrapped effect SHALL NOT execute

#### Scenario: whenVerbose executes at verbose level

- **WHEN** the verbosity level is `"verbose"`
- **AND** a handler calls `whenVerbose(renderer.info("details"))`
- **THEN** the wrapped effect SHALL execute

#### Scenario: whenVerbose skips at normal level

- **WHEN** the verbosity level is `"normal"`
- **AND** a handler calls `whenVerbose(renderer.info("details"))`
- **THEN** the wrapped effect SHALL NOT execute

#### Scenario: whenDebug executes at debug level

- **WHEN** the verbosity level is `"debug"`
- **AND** a handler calls `whenDebug(renderer.info("trace"))`
- **THEN** the wrapped effect SHALL execute

### Requirement: Effect logger integration

The verbosity level SHALL map to an Effect `LogLevel` at the layer boundary. `Effect.log`, `Effect.logDebug`, etc. SHALL respect the verbosity setting.

#### Scenario: Quiet maps to Warning log level

- **WHEN** the verbosity level is `"quiet"`
- **THEN** `Effect.log` (Info level) messages SHALL be suppressed
- **AND** `Effect.logWarning` messages SHALL be visible

#### Scenario: Normal maps to Info log level

- **WHEN** the verbosity level is `"normal"`
- **THEN** `Effect.log` messages SHALL be visible
- **AND** `Effect.logDebug` messages SHALL be suppressed

#### Scenario: Verbose maps to Debug log level

- **WHEN** the verbosity level is `"verbose"`
- **THEN** `Effect.logDebug` messages SHALL be visible

#### Scenario: Debug maps to Trace log level

- **WHEN** the verbosity level is `"debug"`
- **THEN** `Effect.logTrace` messages SHALL be visible

### Requirement: Verbosity layer construction

A `makeVerbosityLayer(level)` function SHALL construct the `Verbosity` layer from a resolved level. It SHALL be called at the `run()` boundary.

#### Scenario: Layer provides correct level

- **WHEN** `makeVerbosityLayer("verbose")` is called
- **THEN** the provided `Verbosity` service SHALL have `level: "verbose"`
- **AND** `isAtLeast("verbose")` SHALL return `true`
