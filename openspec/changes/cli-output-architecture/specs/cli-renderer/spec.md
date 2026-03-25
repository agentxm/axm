## ADDED Requirements

### Requirement: CliRenderer service interface

The `CliRenderer` service SHALL be defined as an Effect service providing all output methods: chrome methods (`intro`, `outro`, `message`, `info`, `success`, `step`, `warn`, `error`, `cancel`, `note`, `box`), activity methods (`spinner`, `withSpinner`, `progress`, `withProgress`, `taskLog`, `withTaskLog`, `runTasks`), data display methods (`table`, `detail`, `tree`), machine data methods (`result`, `resultStream`), and unconditional output methods (`json`, `raw`).

#### Scenario: Handler accesses single service for all output

- **WHEN** a handler needs to display chrome, tabular data, and machine output
- **THEN** it SHALL yield only `CliRenderer` for all output needs
- **AND** no separate `Output`, `Activity`, or data display services SHALL be required

#### Scenario: Chrome methods accept string messages

- **WHEN** a handler calls `renderer.info("Processing 3 skills")`
- **THEN** the message SHALL be rendered with info-level formatting
- **AND** the method SHALL return `Effect<void>`

### Requirement: Chrome methods write to stderr

All chrome methods (`intro`, `outro`, `message`, `info`, `success`, `step`, `warn`, `error`, `cancel`, `note`, `box`, `spinner`, `withSpinner`, `progress`, `withProgress`, `taskLog`, `withTaskLog`, `runTasks`) SHALL write to stderr in both interactive and machine modes. This ensures `axm command --json | jq` works cleanly.

#### Scenario: Chrome output does not appear on stdout

- **WHEN** a handler calls `renderer.info("Processing")` and `renderer.result(data, schema)`
- **AND** stdout is piped to another program
- **THEN** only the JSON from `result()` SHALL appear on stdout
- **AND** the info message SHALL appear on stderr

#### Scenario: Machine mode emits NDJSON chrome on stderr

- **WHEN** the `MachineRenderer` is active
- **AND** a handler calls `renderer.info("Processing")`
- **THEN** stderr SHALL receive a NDJSON log event: `{"type":"log","level":"info","message":"Processing"}`

### Requirement: Data display methods write to stdout

Data display methods (`table`, `detail`, `tree`) and unconditional output methods (`json`, `raw`) SHALL write to stdout. Data display methods SHALL only execute in interactive mode; in machine mode they are no-ops.

#### Scenario: Table output goes to stdout in interactive mode

- **WHEN** the `InteractiveRenderer` is active
- **AND** a handler calls `renderer.table(items, columns)`
- **THEN** the formatted table SHALL appear on stdout

#### Scenario: Table is no-op in machine mode

- **WHEN** the `MachineRenderer` is active
- **AND** a handler calls `renderer.table(items, columns)`
- **THEN** no output SHALL be produced (data goes through `result()` instead)

### Requirement: InteractiveRenderer uses Clack visual language

The `InteractiveRenderer` implementation SHALL use `@clack/prompts` for chrome rendering. It SHALL import `@clack/prompts` directly with no intermediate wrapper modules.

#### Scenario: Clack-styled chrome in interactive mode

- **WHEN** the `InteractiveRenderer` is active
- **AND** a handler calls `renderer.intro("Skills")`
- **THEN** the output SHALL use Clack's `intro()` function with appropriate styling

#### Scenario: No intermediate Clack modules

- **WHEN** the `cli-renderer-interactive.ts` module is inspected
- **THEN** it SHALL import from `@clack/prompts` directly
- **AND** it SHALL NOT import from any `clack-effect/` module

### Requirement: MachineRenderer emits structured output

The `MachineRenderer` SHALL emit validated JSON on stdout for data methods (`result`, `resultStream`) and NDJSON log/progress events on stderr for chrome methods. Data display methods (`table`, `detail`, `tree`) SHALL be no-ops.

#### Scenario: MachineRenderer result writes JSON to stdout

- **WHEN** the `MachineRenderer` is active
- **AND** a handler calls `renderer.result(data, schema)`
- **THEN** the schema-validated JSON SHALL be written to stdout
- **AND** the method SHALL return `true`

#### Scenario: MachineRenderer spinner emits NDJSON progress on stderr

- **WHEN** the `MachineRenderer` is active
- **AND** a handler calls `renderer.withSpinner("Working...", f)`
- **THEN** stderr SHALL receive NDJSON progress events with phase and percent fields

### Requirement: Two-axis terminal detection

Terminal capabilities SHALL be resolved into two independent axes: `canRender` (colors, box-drawing) and `isInteractive` (animations, dynamic updates). These axes SHALL be resolved once at the `run()` boundary.

#### Scenario: CI environment gets static colored output

- **WHEN** `stdout.isTTY` is true
- **AND** `CI=true` is set
- **THEN** `canRender` SHALL be `true` (colors enabled)
- **AND** `isInteractive` SHALL be `false` (no animations)
- **AND** spinners SHALL render as static start/stop messages

#### Scenario: Piped stdout disables rendering

- **WHEN** `stdout.isTTY` is false
- **AND** `NO_COLOR` is not set and `FORCE_COLOR` is not set
- **THEN** `canRender` SHALL be `false`
- **AND** `isInteractive` SHALL be `false`

#### Scenario: FORCE_COLOR overrides TTY detection

- **WHEN** `stdout.isTTY` is false
- **AND** `FORCE_COLOR` is set
- **THEN** `canRender` SHALL be `true`

#### Scenario: NO_COLOR disables rendering

- **WHEN** `NO_COLOR` is set
- **THEN** `canRender` SHALL be `false` regardless of TTY state

#### Scenario: TERM=dumb disables rendering

- **WHEN** `TERM` equals `dumb`
- **THEN** `canRender` SHALL be `false`

### Requirement: Layer selection at run() boundary

The `run()` boundary SHALL select the renderer implementation based on the `--json` flag and terminal capabilities. Selection SHALL use `Layer.unwrapEffect`.

#### Scenario: TTY without --json selects InteractiveRenderer

- **WHEN** stdout is a TTY
- **AND** `--json` is not passed
- **THEN** `InteractiveRenderer` SHALL be provided as the `CliRenderer` layer

#### Scenario: --json flag selects MachineRenderer

- **WHEN** the user passes `--json`
- **THEN** `MachineRenderer` SHALL be provided as the `CliRenderer` layer
- **AND** this SHALL apply regardless of TTY state

#### Scenario: Non-TTY stdout defaults to MachineRenderer

- **WHEN** stdout is not a TTY (piped)
- **AND** `--json` is not passed
- **THEN** `MachineRenderer` SHALL be provided as the `CliRenderer` layer

### Requirement: Foundation layer provides unified output services

The `makeFoundationLayer` function SHALL provide `CliRenderer | CliPrompt | Verbosity` as a single composed layer. It SHALL replace the current `makeUiLayer` and `makeCliEnvironmentLayer` functions.

#### Scenario: Foundation layer provides all output services

- **WHEN** `makeFoundationLayer(options)` is called at the `run()` boundary
- **THEN** the returned layer SHALL provide `CliRenderer`, `CliPrompt`, and `Verbosity`
- **AND** `CliEnvironment` SHALL NOT be required or provided
