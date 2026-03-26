## ADDED Requirements

### Requirement: outputs command group exists

The CLI spike SHALL expose an `outputs` subcommand group under the root command that aggregates all renderer/display demo subcommands.

#### Scenario: help lists all output subcommands

- **WHEN** user runs `axm-spike outputs --help`
- **THEN** the output SHALL list all 14 output subcommands: log, intro, note, box, spinner, progress, task-log, run-tasks, table, detail, tree, stream-log, result, raw

### Requirement: log output demo

The `outputs log` subcommand SHALL invoke all seven log-level methods on `CliRenderer` in sequence: `message()`, `info()`, `success()`, `step()`, `warn()`, `error()`, `cancel()`. No flags.

#### Scenario: log displays all levels

- **WHEN** user runs `axm-spike outputs log`
- **THEN** the command SHALL produce output on stderr containing all seven log-level messages

### Requirement: intro output demo

The `outputs intro` subcommand SHALL invoke `CliRenderer.intro()` and `CliRenderer.outro()` together with hardcoded demo text. No flags.

#### Scenario: intro renders session bookends

- **WHEN** user runs `axm-spike outputs intro`
- **THEN** the command SHALL render both intro and outro framing messages

### Requirement: note output demo

The `outputs note` subcommand SHALL invoke `CliRenderer.note()` showing two examples: one with a title and one without. No flags.

#### Scenario: note renders boxed callout

- **WHEN** user runs `axm-spike outputs note`
- **THEN** the command SHALL render boxed note content

### Requirement: box output demo

The `outputs box` subcommand SHALL invoke `CliRenderer.box()` with flags that map to `BoxOptions` configuration options.

#### Scenario: box with default options

- **WHEN** user runs `axm-spike outputs box`
- **THEN** the command SHALL render a bordered box with default styling

#### Scenario: box with custom options

- **WHEN** user runs `axm-spike outputs box --rounded --width 40 --title "Demo"`
- **THEN** the command SHALL render a box with rounded corners, width 40, and title "Demo"

#### Scenario: box with content alignment

- **WHEN** user runs `axm-spike outputs box --content-align center`
- **THEN** the box content SHALL be center-aligned

#### Scenario: box with title alignment

- **WHEN** user runs `axm-spike outputs box --title "Demo" --title-align right`
- **THEN** the box title SHALL be right-aligned

#### Scenario: box with padding

- **WHEN** user runs `axm-spike outputs box --padding 2`
- **THEN** the box SHALL have inner padding of 2

### Requirement: spinner output demo

The `outputs spinner` subcommand SHALL invoke `CliRenderer.withSpinner()` with flags that map to `SpinnerOptions`. The command SHALL use `isLongRunning: true` in `withRuntime`.

#### Scenario: spinner completes successfully

- **WHEN** user runs `axm-spike outputs spinner`
- **THEN** the command SHALL show a spinner animation that completes with a success message

#### Scenario: spinner with custom success message

- **WHEN** user runs `axm-spike outputs spinner --success-message "All done!"`
- **THEN** the spinner SHALL complete displaying "All done!"

#### Scenario: spinner with failure message

- **WHEN** user runs `axm-spike outputs spinner --failure-message "Oops"`
- **THEN** the spinner SHALL use "Oops" as the failure completion text

### Requirement: progress output demo

The `outputs progress` subcommand SHALL invoke `CliRenderer.withProgress()` with flags that map to `ProgressConfig`. The command SHALL use `isLongRunning: true` in `withRuntime`.

#### Scenario: progress with default style

- **WHEN** user runs `axm-spike outputs progress`
- **THEN** the command SHALL render a progress bar that fills to completion

#### Scenario: progress with block style

- **WHEN** user runs `axm-spike outputs progress --style block`
- **THEN** the progress bar SHALL use the block character set

#### Scenario: progress with custom max and size

- **WHEN** user runs `axm-spike outputs progress --max 50 --size 30`
- **THEN** the progress bar SHALL use a maximum of 50 and a bar width of 30

### Requirement: task-log output demo

The `outputs task-log` subcommand SHALL invoke `CliRenderer.withTaskLog()` with flags that map to `TaskLogConfig`. The command SHALL use `isLongRunning: true` in `withRuntime`.

#### Scenario: task-log with default options

- **WHEN** user runs `axm-spike outputs task-log`
- **THEN** the command SHALL display a structured task log with collapsible messages

#### Scenario: task-log with line limit

- **WHEN** user runs `axm-spike outputs task-log --limit 5`
- **THEN** the task log SHALL display at most 5 visible log lines

#### Scenario: task-log with retained output

- **WHEN** user runs `axm-spike outputs task-log --retain-log`
- **THEN** the task log SHALL keep output visible after completion

### Requirement: run-tasks output demo

The `outputs run-tasks` subcommand SHALL invoke `CliRenderer.runTasks()` with a hardcoded set of simulated tasks. No flags.

#### Scenario: run-tasks shows task status

- **WHEN** user runs `axm-spike outputs run-tasks`
- **THEN** the command SHALL run simulated tasks and display pass/fail status for each

### Requirement: table output demo

The `outputs table` subcommand SHALL invoke `CliRenderer.table()` with sample skill data and a flag for the caption parameter.

#### Scenario: table renders data

- **WHEN** user runs `axm-spike outputs table`
- **THEN** the command SHALL render a columnar table with sample skill data

#### Scenario: table with caption

- **WHEN** user runs `axm-spike outputs table --caption "My Skills"`
- **THEN** the table SHALL display "My Skills" as the caption

### Requirement: detail output demo

The `outputs detail` subcommand SHALL invoke `CliRenderer.detail()` with sample data and a flag for the title parameter.

#### Scenario: detail renders key-value pairs

- **WHEN** user runs `axm-spike outputs detail`
- **THEN** the command SHALL render a key/value detail view

#### Scenario: detail with custom title

- **WHEN** user runs `axm-spike outputs detail --title "Skill Info"`
- **THEN** the detail view SHALL display "Skill Info" as the section header

### Requirement: tree output demo

The `outputs tree` subcommand SHALL invoke `CliRenderer.tree()` with a sample workspace file structure and a flag for the title parameter.

#### Scenario: tree renders hierarchy

- **WHEN** user runs `axm-spike outputs tree`
- **THEN** the command SHALL render a hierarchical tree with labels, details, and icons

#### Scenario: tree with custom title

- **WHEN** user runs `axm-spike outputs tree --title "Project"`
- **THEN** the tree SHALL display "Project" as the header

### Requirement: stream-log output demo

The `outputs stream-log` subcommand SHALL invoke `CliRenderer.streamLog()` with a simulated streaming build log at a fixed log level. No flags. The command SHALL use `isLongRunning: true` in `withRuntime`.

#### Scenario: stream-log produces output

- **WHEN** user runs `axm-spike outputs stream-log`
- **THEN** the command SHALL render streaming text line-by-line

### Requirement: result output demo

The `outputs result` subcommand SHALL invoke `CliRenderer.result()` and `CliRenderer.resultStream()` with a flag to switch between human-readable and machine-readable modes.

#### Scenario: result in human mode

- **WHEN** user runs `axm-spike outputs result`
- **THEN** the command SHALL render human-readable output on stdout

#### Scenario: result in JSON mode

- **WHEN** user runs `axm-spike outputs result --json`
- **THEN** the command SHALL emit valid JSON on stdout

#### Scenario: result with global output-format flag

- **WHEN** user runs `axm-spike outputs result --output-format json`
- **THEN** the command SHALL emit structured JSON output via the global flag

### Requirement: raw output demo

The `outputs raw` subcommand SHALL invoke `CliRenderer.raw()` and `CliRenderer.json()` with a flag to switch between modes.

#### Scenario: raw text output

- **WHEN** user runs `axm-spike outputs raw`
- **THEN** the command SHALL write unformatted text to stdout via `raw()`

#### Scenario: raw JSON output

- **WHEN** user runs `axm-spike outputs raw --json`
- **THEN** the command SHALL write raw JSON to stdout via `json()`

### Requirement: output demo flags map to service options

Every per-command flag on an output subcommand SHALL map directly to a configuration option on the corresponding `CliRenderer` method. No simulation knobs or content override flags SHALL be present.

#### Scenario: no simulation flags exist

- **WHEN** user inspects the flags of any output subcommand via `--help`
- **THEN** every listed flag SHALL correspond to a parameter on the underlying `CliRenderer` method

### Requirement: output demo help text follows conventions

Each output subcommand SHALL have a single-line imperative description via `Command.withDescription()`. Flag documentation SHALL live on each flag's `Flag.withDescription()`.

#### Scenario: help text is single-line

- **WHEN** user runs `axm-spike outputs box --help`
- **THEN** the command description SHALL be a single-line imperative sentence
- **THEN** each flag SHALL have its own description in the flags section

### Requirement: async output demos use isLongRunning

Output subcommands that use `Effect.sleep` for simulation (spinner, progress, task-log, stream-log, run-tasks) SHALL set `isLongRunning: true` in `withRuntime`.

#### Scenario: spinner does not exit prematurely

- **WHEN** user runs `axm-spike outputs spinner`
- **THEN** the command SHALL wait for the spinner animation to complete before exiting
