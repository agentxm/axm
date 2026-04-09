# cli-renderer-chrome

Custom stderr chrome for the interactive CLI renderer that visually complements Effect v4 Prompt output.

## ADDED Requirements

### Requirement: Log lines use symbol-prefixed flat style

The interactive renderer SHALL render log lines as `symbol message` on stderr without vertical guide bars. Each log level uses a distinct symbol and color:

- `message`: `○` (dim)
- `info`: `●` (cyan)
- `success`: `✔` (green)
- `step`: `◆` (cyan)
- `warn`: `▲` (yellow)
- `error`: `✖` (red)

#### Scenario: Info message rendering

- **WHEN** `renderer.info("Resolved 3 skills")` is called
- **THEN** stderr displays `●  Resolved 3 skills` with `●` in cyan

#### Scenario: Error message rendering

- **WHEN** `renderer.error("Auth token expired")` is called
- **THEN** stderr displays `✖  Auth token expired` with `✖` in red

#### Scenario: Success message rendering

- **WHEN** `renderer.success("Installation complete")` is called
- **THEN** stderr displays `✔  Installation complete` with `✔` in green

#### Scenario: Warning message rendering

- **WHEN** `renderer.warn("Registry unreachable")` is called
- **THEN** stderr displays `▲  Registry unreachable` with `▲` in yellow

### Requirement: Intro and outro use distinct symbols

The renderer SHALL render `intro` with `◇` (cyan, bold) and `outro` with `◇` (green).

#### Scenario: Intro rendering

- **WHEN** `renderer.intro("axm v1.0.0")` is called
- **THEN** stderr displays `◇  axm v1.0.0` with `◇` in bold cyan

#### Scenario: Outro rendering

- **WHEN** `renderer.outro("Done")` is called
- **THEN** stderr displays `◇  Done` with `◇` in green

### Requirement: Cancel uses stop symbol

The renderer SHALL render `cancel` with `■` (red).

#### Scenario: Cancel rendering

- **WHEN** `renderer.cancel("Operation cancelled")` is called
- **THEN** stderr displays `■  Operation cancelled` with `■` in red

### Requirement: Spinner cycles characters and resolves to final symbol

The renderer SHALL display a spinner using cycling characters `◒◐◓◑` with ANSI line erasure for in-place updates. On completion, the spinner line SHALL be replaced with the appropriate final symbol (`✔` for stop, `✖` for error, `■` for cancel).

#### Scenario: Spinner start and stop

- **WHEN** a spinner is started with "Downloading..." and then stopped with "Downloaded"
- **THEN** the spinner displays `◒  Downloading...` with cycling characters, then resolves to `✔  Downloaded` in green

#### Scenario: Spinner error

- **WHEN** a spinner is started and then `.error("Failed")` is called
- **THEN** the spinner line resolves to `✖  Failed` in red

#### Scenario: Spinner cancel

- **WHEN** a spinner is started and then `.cancel("Cancelled")` is called
- **THEN** the spinner line resolves to `■  Cancelled` in red

#### Scenario: Spinner clear

- **WHEN** a spinner is started and then `.clear()` is called
- **THEN** the spinner line is erased with no replacement output

### Requirement: Progress bar renders inline with percentage

The renderer SHALL display a progress bar as `◒  [████░░░░░░] 42% message` with the spinner character as leading symbol during updates. The bar width SHALL adapt to terminal width. On completion the leading symbol SHALL change to `✔`.

#### Scenario: Progress bar advance

- **WHEN** a progress bar is created with `max: 10` and `.advance(3)` is called
- **THEN** stderr displays a bar at 30% fill with the current message

#### Scenario: Progress bar completion

- **WHEN** a progress bar reaches 100% via `.stop("Done")`
- **THEN** the bar line resolves to `✔  Done` in green

### Requirement: Note renders with horizontal rules

The renderer SHALL render `note` as the message body between `─` horizontal rules on stderr. An optional title SHALL appear on the top rule.

#### Scenario: Note with title

- **WHEN** `renderer.note("Check your credentials", "Auth Required")` is called
- **THEN** stderr displays a top rule with title, the message body, and a bottom rule

#### Scenario: Note without title

- **WHEN** `renderer.note("All checks passed")` is called
- **THEN** stderr displays a top rule, the message body, and a bottom rule

### Requirement: Box renders with configurable alignment and padding

The renderer SHALL render `box` as bordered content with configurable content alignment, title alignment, width, and padding using box-drawing characters.

#### Scenario: Centered box with title

- **WHEN** `renderer.box("Hello world", "Greeting", { contentAlignment: "center" })` is called
- **THEN** stderr displays a box with centered content and the title on the top border

### Requirement: Stream log outputs accumulated content

The renderer SHALL render `streamLog` by collecting the stream and outputting the accumulated text using the corresponding log level symbol and styling.

#### Scenario: Stream log info

- **WHEN** `renderer.streamLog("info", stream)` is called with a stream of `["line1", "line2"]`
- **THEN** stderr displays the accumulated content with info-level styling

### Requirement: Table renders without guide prefix

The table formatter SHALL render column-aligned tabular data to stdout without the `│` vertical guide prefix. Headers, separator, and data rows SHALL use clean left-alignment.

#### Scenario: Table rendering

- **WHEN** `renderer.table(items, columns)` is called
- **THEN** stdout displays headers, a `─` separator row, and data rows without `│` prefix

### Requirement: Detail renders without guide prefix

The detail formatter SHALL render vertical key-value pairs to stdout without the `│` guide prefix.

#### Scenario: Detail rendering

- **WHEN** `renderer.detail(item, columns, "Title")` is called
- **THEN** stdout displays the title and label-value pairs without `│` prefix

### Requirement: Tree renders without guide prefix

The tree formatter SHALL render hierarchical data to stdout using `├─` and `└─` connectors without the `│` guide prefix on every line.

#### Scenario: Tree rendering

- **WHEN** `renderer.tree(roots, def)` is called
- **THEN** stdout displays the tree with branch connectors but without `│` prefix on the outermost level

### Requirement: Task log renders with grouped output

The renderer SHALL render `taskLog` with grouped messages. Group headers SHALL be visually distinct. Messages within groups SHALL be indented.

#### Scenario: Task log with group

- **WHEN** a task log is created and a group "Build" is started with messages
- **THEN** stderr displays the group name as a header with indented messages beneath

### Requirement: RunTasks executes sequentially with spinner per task

The renderer SHALL execute tasks sequentially, showing a spinner for each. Completed tasks SHALL show `✔` with the result message.

#### Scenario: Multiple tasks

- **WHEN** `renderer.runTasks([{ title: "Build", task: ... }, { title: "Test", task: ... }])` is called
- **THEN** each task runs with a spinner, completing with `✔` and its result message

### Requirement: No @clack/prompts dependency

The interactive renderer SHALL NOT import or depend on `@clack/prompts`. All styling SHALL use Effect ANSI primitives or direct ANSI escape sequences.

#### Scenario: Dependency removal

- **WHEN** the implementation is complete
- **THEN** `@clack/prompts` does not appear in `packages/core/package.json` or `packages/cli/package.json` dependencies

### Requirement: Legacy clack prompt adapter removed

The files `cli-prompt-interactive.ts`, `clack-prompt-options.ts`, and their tests SHALL be removed from `packages/core/src/unstable/cli-prompt/`.

#### Scenario: File removal

- **WHEN** the implementation is complete
- **THEN** `cli-prompt-interactive.ts`, `clack-prompt-options.ts`, and `cli-prompt-interactive.test.ts` no longer exist in the codebase
